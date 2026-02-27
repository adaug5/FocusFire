/**
 * Shadow Draft: draft branch, amend-based auto-save, squash into main.
 * @see focusfire-architecture.mdc — Engine layer, UI-agnostic.
 */

import git from "isomorphic-git";
import { GitRepository, CONTENT_FILE, DEFAULT_AUTHOR } from "../git";
import { stringifyDocument } from "../markdown";

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
   * @deprecated Use finalizeCommit(message) instead.
   */
  async commitDraft(finalMessage: string): Promise<string> {
    return this.finalizeCommit(finalMessage);
  }
}
