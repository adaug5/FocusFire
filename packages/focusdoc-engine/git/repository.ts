/**
 * Git-backed document repository: one repo per documentId, stored in IndexedDB via LightningFS.
 * @see focusfire-architecture.mdc — Engine layer, UI-agnostic.
 */

import git from "isomorphic-git";
import FS from "@isomorphic-git/lightning-fs";

const WORKING_DIR = "/";
export const CONTENT_FILE = "content.md";

const DEFAULT_AUTHOR = {
  name: "FocusDoc",
  email: "noreply@focusdoc.local",
};

/** Default author/committer for commits (exported for draft-manager). */
export { DEFAULT_AUTHOR };

/**
 * Sanitizes documentId for use as an IndexedDB store name (alphanumeric, hyphen, underscore).
 */
function sanitizeStoreName(documentId: string): string {
  return documentId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export class GitRepository {
  readonly #documentId: string;
  #fs: FS | null = null;
  readonly #dir = WORKING_DIR;

  constructor(documentId: string) {
    this.#documentId = documentId;
  }

  /**
   * Creates the LightningFS instance and initializes the Git repo (idempotent).
   * Call once before using saveSnapshot.
   */
  async initialize(): Promise<void> {
    const storeName = `focusdoc-${sanitizeStoreName(this.#documentId)}`;
    this.#fs = new FS(storeName);

    const fs = this.#fs;
    const dir = this.#dir;

    try {
      await fs.promises.stat(`${dir}.git`);
    } catch {
      await git.init({ fs, dir, defaultBranch: "main" });
    }
  }

  /**
   * Writes content to the tracked file, stages it, and commits to main.
   * @returns The commit SHA of the new commit.
   */
  async saveSnapshot(content: string, message: string): Promise<string> {
    if (!this.#fs) {
      throw new Error("GitRepository not initialized; call initialize() first.");
    }

    const fs = this.#fs;
    const dir = this.#dir;
    const filePath = `${dir}${CONTENT_FILE}`;

    await fs.promises.writeFile(filePath, content, { encoding: "utf8" });
    await git.add({ fs, dir, filepath: CONTENT_FILE });
    const sha = await git.commit({
      fs,
      dir,
      message,
      ref: "refs/heads/main",
      author: DEFAULT_AUTHOR,
      committer: DEFAULT_AUTHOR,
    });

    return sha;
  }

  /**
   * Returns fs and dir for package-internal use (e.g. draft-manager).
   * @throws if initialize() has not been called
   */
  getFsAndDir(): { fs: FS; dir: string } {
    if (!this.#fs) {
      throw new Error("GitRepository not initialized; call initialize() first.");
    }
    return { fs: this.#fs, dir: this.#dir };
  }
}
