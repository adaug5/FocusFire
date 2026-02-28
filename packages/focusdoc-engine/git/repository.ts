/**
 * Git-backed document repository: one repo per documentId, stored in IndexedDB via LightningFS.
 * @see focusfire-architecture.mdc — Engine layer, UI-agnostic.
 */

import git from "isomorphic-git";
import FS from "@isomorphic-git/lightning-fs";
import { stringifyDocument } from "../markdown";

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

/**
 * Returns the IndexedDB database name used by LightningFS for this documentId.
 * Use for deleting the database when removing a document (e.g. in LibraryManager).
 */
export function getIndexedDBNameForDocument(documentId: string): string {
  return `focusdoc-${sanitizeStoreName(documentId)}`;
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
   * When metadata is provided, the file is written as YAML frontmatter + content via stringifyDocument.
   * @param content - Markdown body (when metadata is provided, this is the content after frontmatter)
   * @param message - Commit message
   * @param metadata - Optional frontmatter; when present, content is serialized with stringifyDocument(metadata, content)
   * @returns The commit SHA of the new commit.
   */
  async saveSnapshot(
    content: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.#fs) {
      throw new Error("GitRepository not initialized; call initialize() first.");
    }

    const fs = this.#fs;
    const dir = this.#dir;
    const filePath = `${dir}${CONTENT_FILE}`;

    const contentToWrite =
      metadata !== undefined && metadata !== null
        ? stringifyDocument(metadata, content)
        : content;

    await fs.promises.writeFile(filePath, contentToWrite, { encoding: "utf8", mode: 0o666 });
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
