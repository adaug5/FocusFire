/**
 * Shadow Draft: draft branch, amend-based auto-save, squash into main.
 * @see focusfire-architecture.mdc — Engine layer, UI-agnostic.
 */

import git from "isomorphic-git";
import { GitRepository, CONTENT_FILE, DEFAULT_AUTHOR } from "../git";

const DRAFT_BRANCH = "draft";
const MAIN_REF = "refs/heads/main";
const DRAFT_REF = "refs/heads/draft";

export class DraftManager {
  readonly #repo: GitRepository;
  #draftReady = false;

  constructor(documentId: string) {
    this.#repo = new GitRepository(documentId);
  }

  /**
   * Ensures repo is initialized and the draft branch exists and is checked out.
   * Idempotent. Call on "document opened" or from updateDraft/commitDraft.
   */
  async ensureDraftReady(): Promise<void> {
    if (this.#draftReady) return;

    await this.#repo.initialize();
    const { fs, dir } = this.#repo.getFsAndDir();

    // Ensure main has at least one commit (new repo has no commits)
    let mainOid: string;
    try {
      mainOid = await git.resolveRef({ fs, dir, ref: MAIN_REF });
    } catch {
      await fs.promises.writeFile(`${dir}${CONTENT_FILE}`, "", {
        encoding: "utf8",
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

    const branches = await git.listBranches({ fs, dir });
    if (!branches.includes(DRAFT_BRANCH)) {
      await git.branch({
        fs,
        dir,
        ref: DRAFT_BRANCH,
        object: mainOid,
        checkout: true,
      });
    } else {
      await git.checkout({ fs, dir, ref: DRAFT_BRANCH });
    }

    this.#draftReady = true;
  }

  /**
   * Writes content to the draft and amends the draft commit (one commit ahead of main).
   */
  async updateDraft(content: string): Promise<void> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();

    await fs.promises.writeFile(`${dir}${CONTENT_FILE}`, content, {
      encoding: "utf8",
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
   * @returns The new commit SHA on main.
   */
  async commitDraft(finalMessage: string): Promise<string> {
    await this.ensureDraftReady();
    const { fs, dir } = this.#repo.getFsAndDir();

    const mainOid = await git.resolveRef({ fs, dir, ref: MAIN_REF });
    const draftOid = await git.resolveRef({ fs, dir, ref: DRAFT_REF });
    const { commit: draftCommit } = await git.readCommit({
      fs,
      dir,
      oid: draftOid,
    });

    const newOid = await git.commit({
      fs,
      dir,
      ref: MAIN_REF,
      message: finalMessage,
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
    await git.checkout({ fs, dir, ref: DRAFT_BRANCH });

    return newOid;
  }
}
