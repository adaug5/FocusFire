/**
 * Shadow Draft: draft branch, amend-based auto-save, squash into main.
 * Thread (branching): use createThread(name), switchThread(name), getThreads() — do not use repo or git directly.
 * @see focusfire-architecture.mdc — Engine layer, UI-agnostic.
 */

import git from "isomorphic-git";
import { GitRepository, CONTENT_FILE, DEFAULT_AUTHOR } from "../git";
import { parseDocument, stringifyDocument } from "../markdown";

const DRAFT_BRANCH = "draft";
const MAIN_REF = "refs/heads/main";
const DRAFT_REF = "refs/heads/draft";

/** One DraftManager instance per documentId (singleton per document). */
const instancesByDocumentId = new Map<string, DraftManager>();

/** Init lock per documentId so ensureDraftReady is not run concurrently. */
const initPromisesByDocumentId = new Map<string, Promise<void>>();

/**
 * Thrown when the draft branch is out of date relative to main (e.g. main has new commits).
 * Callers should prompt the user to pull/merge before finalizing.
 */
export class DraftConflictError extends Error {
  constructor(message = "Draft is out of date: main has new commits. Pull or merge before finalizing.") {
    super(message);
    this.name = "DraftConflictError";
    Object.setPrototypeOf(this, DraftConflictError.prototype);
  }
}

export class DraftManager {
  readonly #repo: GitRepository;
  readonly #documentId: string;
  #draftReady = false;
  #currentThread: string = "main";

  private constructor(documentId: string) {
    this.#documentId = documentId;
    this.#repo = new GitRepository(documentId);
  }

  /**
   * Returns the singleton DraftManager for this documentId. Use this instead of `new DraftManager(id)`.
   */
  static getInstance(documentId: string): DraftManager {
    let instance = instancesByDocumentId.get(documentId);
    if (!instance) {
      instance = new DraftManager(documentId);
      instancesByDocumentId.set(documentId, instance);
    }
    return instance;
  }

  /**
   * Debug only: access the underlying GitRepository (e.g. in console).
   * Prefer using createThread, switchThread, and getThreads for branch operations.
   */
  get repo(): GitRepository {
    return this.#repo;
  }

  /**
   * Ensures repo is initialized and the draft branch exists and is checked out.
   * Only one init runs at a time per documentId. If draft and main have diverged at startup, draft is reset to main and one commit is created so draft stays one ahead.
   * Idempotent. Call on "document opened" or from updateDraft/finalizeCommit.
   */
  async ensureDraftReady(): Promise<void> {
    if (this.#draftReady) return;

    let initPromise = initPromisesByDocumentId.get(this.#documentId);
    if (!initPromise) {
      initPromise = this.#doEnsureDraftReady();
      initPromisesByDocumentId.set(this.#documentId, initPromise);
    }
    await initPromise;
  }

  async #doEnsureDraftReady(): Promise<void> {
    if (this.#draftReady) return;

    await this.#repo.initialize();
    const { fs, dir } = this.#repo.getFsAndDir();

    // Ensure main has at least one commit; only create Initial commit if no commit exists yet
    let mainOid: string;
    try {
      mainOid = await git.resolveRef({ fs, dir, ref: MAIN_REF });
    } catch {
      try {
        mainOid = await git.resolveRef({ fs, dir, ref: MAIN_REF });
      } catch {
        await fs.promises.writeFile(`${dir}${CONTENT_FILE}`, "", {
          encoding: "utf8",
          mode: 0o666,
        });
        await git.add({ fs, dir, filepath: CONTENT_FILE });
        mainOid = await git.commit({
          fs,
          dir,
          message: "Initial commit",
          ref: MAIN_REF,
          author: DEFAULT_AUTHOR,
          committer: DEFAULT_AUTHOR,
        });
      }
    }

    const branches = await git.listBranches({ fs, dir });
    if (!branches.includes(DRAFT_BRANCH)) {
      await git.branch({
        fs,
        dir,
        ref: DRAFT_BRANCH,
        object: mainOid,
        checkout: true,
      });

      const { commit: mainCommit } = await git.readCommit({ fs, dir, oid: mainOid });
      await git.commit({
        fs,
        dir,
        ref: DRAFT_REF,
        message: "draft",
        parent: [mainOid],
        tree: mainCommit.tree,
        author: DEFAULT_AUTHOR,
        committer: DEFAULT_AUTHOR,
      });
      await fs.promises.flush();
    } else {
      await git.checkout({ fs, dir, ref: DRAFT_BRANCH });
      const draftOid = await git.resolveRef({ fs, dir, ref: DRAFT_REF });
      const { commit: draftCommit } = await git.readCommit({ fs, dir, oid: draftOid });
      const draftParent = draftCommit.parent?.[0];
      if (draftParent !== mainOid) {
        await git.writeRef({ fs, dir, ref: DRAFT_REF, value: mainOid, force: true });
        await fs.promises.flush();
        await git.checkout({ fs, dir, ref: DRAFT_BRANCH });
        const { commit: mainCommit } = await git.readCommit({ fs, dir, oid: mainOid });
        await git.commit({
          fs,
          dir,
          ref: DRAFT_REF,
          message: "draft",
          parent: [mainOid],
          tree: mainCommit.tree,
          author: DEFAULT_AUTHOR,
          committer: DEFAULT_AUTHOR,
        });
        await fs.promises.flush();
      }
    }

    this.#draftReady = true;
  }

  /**
   * Writes content to the draft and amends the draft commit (one commit ahead of main).
   * When metadata is provided, the file is written as YAML frontmatter + content via stringifyDocument.
   */
  async updateDraft(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();

    const contentToWrite =
      metadata !== undefined && metadata !== null
        ? stringifyDocument(metadata, content)
        : content;

    await fs.promises.writeFile(`${dir}${CONTENT_FILE}`, contentToWrite, {
      encoding: "utf8",
      mode: 0o666,
    });
    await git.add({ fs, dir, filepath: CONTENT_FILE });
    await git.commit({
      fs,
      dir,
      ref: DRAFT_REF,
      message: "draft",
      amend: true,
      author: DEFAULT_AUTHOR,
      committer: DEFAULT_AUTHOR,
    });
  }

  /**
   * Loads the current document content and metadata.
   * - Prefers the latest commit on the shadow draft branch (auto-saved state) when it is as recent or newer.
   * - Falls back to the current thread/main HEAD when the draft branch or file is missing.
   * - Never throws for missing branches/files; always returns sensible defaults.
   */
  async loadDocument(): Promise<{ content: string; metadata: any }> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();

    const threadName = this.#currentThread || "main";
    const baseRef = threadName === "main" ? MAIN_REF : `refs/heads/${threadName}`;

    const decode = (data: Uint8Array): string => {
      if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(data);
      }
      let result = "";
      for (let i = 0; i < data.length; i += 1) {
        result += String.fromCharCode(data[i]);
      }
      return result;
    };

    let baseTimestamp = 0;
    let baseResult: { content: string; metadata: any } = { content: "", metadata: {} };

    try {
      const baseOid = await git.resolveRef({ fs, dir, ref: baseRef });
      const { commit: baseCommit } = await git.readCommit({ fs, dir, oid: baseOid });
      baseTimestamp = baseCommit.committer?.timestamp ?? 0;

      try {
        const { blob } = await git.readBlob({
          fs,
          dir,
          oid: baseOid,
          filepath: CONTENT_FILE,
        });
        const raw = decode(blob as Uint8Array);
        if (raw && raw.length > 0) {
          const parsed = parseDocument(raw);
          baseResult = {
            content: parsed.content ?? "",
            metadata: parsed.metadata ?? {},
          };
        }
      } catch {
        // Missing content file on base branch: keep defaults.
      }
    } catch {
      // Missing base branch/ref: keep defaults.
    }

    let draftTimestamp = 0;
    let draftResult: { content: string; metadata: any } | null = null;

    try {
      const draftOid = await git.resolveRef({ fs, dir, ref: DRAFT_REF });
      const { commit: draftCommit } = await git.readCommit({ fs, dir, oid: draftOid });
      draftTimestamp = draftCommit.committer?.timestamp ?? 0;

      try {
        const { blob } = await git.readBlob({
          fs,
          dir,
          oid: draftOid,
          filepath: CONTENT_FILE,
        });
        const raw = decode(blob as Uint8Array);
        if (raw && raw.length > 0) {
          const parsed = parseDocument(raw);
          draftResult = {
            content: parsed.content ?? "",
            metadata: parsed.metadata ?? {},
          };
        } else {
          draftResult = { content: "", metadata: {} };
        }
      } catch {
        // Missing content file on draft: treat as empty.
        draftResult = { content: "", metadata: {} };
      }
    } catch {
      // No draft ref; ignore and fall back to baseResult.
    }

    if (draftResult && draftTimestamp >= baseTimestamp) {
      return draftResult;
    }

    return baseResult;
  }

  /**
   * Squashes the current draft into a single commit on main, then points draft at the new main.
   * Throws DraftConflictError if main has new commits (draft's parent !== main HEAD).
   * @returns The new commit SHA on main.
   */
  async finalizeCommit(message: string): Promise<string> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();

    const mainOid = await git.resolveRef({ fs, dir, ref: MAIN_REF });
    const draftOid = await git.resolveRef({ fs, dir, ref: DRAFT_REF });
    const { commit: draftCommit } = await git.readCommit({
      fs,
      dir,
      oid: draftOid,
    });

    const draftParent = draftCommit.parent?.[0];
    if (draftParent !== mainOid) {
      throw new DraftConflictError();
    }

    const newOid = await git.commit({
      fs,
      dir,
      ref: MAIN_REF,
      message,
      parent: [mainOid],
      tree: draftCommit.tree,
      author: DEFAULT_AUTHOR,
      committer: DEFAULT_AUTHOR,
    });

    await git.writeRef({
      fs,
      dir,
      ref: DRAFT_REF,
      value: newOid,
      force: true,
    });
    await fs.promises.flush();
    await git.checkout({ fs, dir, ref: DRAFT_BRANCH });

    return newOid;
  }

  /**
   * Returns the underlying fs and dir for debugging/inspection (e.g. reading refs/heads in IndexedDB).
   * Call ensureDraftReady() first so the repo is initialized.
   */
  getFsAndDir(): ReturnType<GitRepository["getFsAndDir"]> {
    return this.#repo.getFsAndDir();
  }

  /**
   * Debug: returns current branch names and SHAs for main and draft using listBranches and resolveRef.
   * Ensures draft is ready first so refs exist.
   */
  async getRefs(): Promise<{ branches: string[]; main: string; draft?: string }> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();
    const branches = await git.listBranches({ fs, dir });
    const main = await git.resolveRef({ fs, dir, ref: MAIN_REF });
    let draft: string | undefined;
    if (branches.includes(DRAFT_BRANCH)) {
      draft = await git.resolveRef({ fs, dir, ref: DRAFT_REF });
    }
    return { branches, main, draft };
  }

  /**
   * Returns a commit history for the current thread/main branch, excluding shadow draft commits.
   */
  async getHistory(): Promise<
    Array<{ sha: string; message: string; timestamp: number; author: string }>
  > {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();

    const threadName = this.#currentThread || "main";
    const ref = threadName === "main" ? MAIN_REF : `refs/heads/${threadName}`;

    let entries: Awaited<ReturnType<typeof git.log>> = [];
    try {
      entries = await git.log({ fs, dir, ref });
    } catch {
      // Missing branch/ref: return empty history instead of throwing.
      return [];
    }

    return entries
      .filter((entry) => entry.commit.message !== "draft")
      .map((entry) => {
        const { commit, oid } = entry;
        const authorName = commit.author?.name ?? "Unknown";
        const tsSeconds =
          (commit.committer?.timestamp ??
            // Fallback to author timestamp if needed
            (commit.author as any)?.timestamp ??
            0) as number;

        return {
          sha: oid,
          message: commit.message,
          timestamp: tsSeconds * 1000,
          author: authorName,
        };
      });
  }

  /**
   * Creates a new thread (branch) at the current draft HEAD. Does not switch to it.
   * @throws If a branch with this name already exists.
   */
  async createThread(name: string): Promise<void> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();
    const currentOid = await git.resolveRef({ fs, dir, ref: DRAFT_REF });
    try {
      await git.branch({
        fs,
        dir,
        ref: name,
        object: currentOid,
      });
    } catch (err) {
      const branches = await git.listBranches({ fs, dir });
      if (branches.includes(name)) {
        throw new Error(`Thread already exists: ${name}`);
      }
      throw err;
    }
  }

  /**
   * Switches to the given thread: checkouts that branch and resets draft to the same commit,
   * then checkouts draft so subsequent updateDraft/finalizeCommit work on that thread.
   * @throws If the thread (branch) does not exist.
   */
  async switchThread(name: string): Promise<void> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();
    const branches = await git.listBranches({ fs, dir });
    if (!branches.includes(name)) {
      throw new Error(`Thread not found: ${name}`);
    }
    const threadOid = await git.resolveRef({ fs, dir, ref: `refs/heads/${name}` });
    await git.writeRef({ fs, dir, ref: DRAFT_REF, value: threadOid, force: true });
    await fs.promises.flush();
    await git.checkout({ fs, dir, ref: DRAFT_BRANCH });
    this.#currentThread = name;
  }

  /**
   * Returns all branch names (including main and draft). Filter in the UI if only user threads are needed.
   */
  async getThreads(): Promise<string[]> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();
    return git.listBranches({ fs, dir });
  }

  /**
   * Official thread-listing API. Currently returns all branches (including main and draft).
   */
  async listThreads(): Promise<string[]> {
    return this.getThreads();
  }

  /**
   * Deletes a thread (branch) by name.
   * - Protects the `main` and `draft` branches from deletion.
   * - Is tolerant of missing branches (no-op instead of throwing).
   */
  async deleteThread(name: string): Promise<void> {
    if (name === "main" || name === DRAFT_BRANCH) {
      throw new Error(`Cannot delete protected thread: ${name}`);
    }

    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();
    const branches = await git.listBranches({ fs, dir });

    if (!branches.includes(name)) {
      // Nothing to delete.
      return;
    }

    await git.deleteBranch({ fs, dir, ref: name });

    if (this.#currentThread === name) {
      this.#currentThread = "main";
      try {
        const mainOid = await git.resolveRef({ fs, dir, ref: MAIN_REF });
        await git.writeRef({ fs, dir, ref: DRAFT_REF, value: mainOid, force: true });
      } catch {
        // If main doesn't exist yet, leave draft as-is; ensureDraftReady will repair on next run.
      }
    }
  }

  /**
   * @deprecated Use finalizeCommit(message) instead.
   */
  async commitDraft(finalMessage: string): Promise<string> {
    return this.finalizeCommit(finalMessage);
  }
}
