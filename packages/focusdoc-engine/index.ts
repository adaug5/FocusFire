/**
 * FocusDoc Engine — Public API.
 * UI-agnostic core: git, markdown, draft-manager.
 * @see packages/focusdoc-engine/
 */

import type { GitRepository } from "./git";
import { CONTENT_FILE } from "./git";
import { parseDocument } from "./markdown";

export { GitRepository } from "./git";
export { DraftManager, DraftConflictError } from "./draft-manager";
export {
  parseDocument,
  stringifyDocument,
  type ParsedDocument,
} from "./markdown";

/**
 * Browser-console test: saves a snapshot with metadata, reads the file back, parses it,
 * and verifies metadata and content round-trip. Call with an initialized GitRepository.
 * @example In browser console: await runMarkdownSaveTest(focusDoc)
 */
export async function runMarkdownSaveTest(repo: GitRepository): Promise<void> {
  const metadata = { title: "Test", status: "draft" as const };
  const content = "# Hello\n\nBody.";

  await repo.saveSnapshot(content, "test: markdown + metadata", metadata);

  const { fs, dir } = repo.getFsAndDir();
  const filePath = `${dir}${CONTENT_FILE}`;
  const raw = (await fs.promises.readFile(filePath, {
    encoding: "utf8",
  })) as string;
  const parsed = parseDocument(raw);

  if (parsed.metadata.title !== metadata.title || parsed.metadata.status !== metadata.status) {
    throw new Error(
      `Markdown save test failed: metadata mismatch. Expected ${JSON.stringify(metadata)}, got ${JSON.stringify(parsed.metadata)}`
    );
  }
  if (parsed.content.trim() !== content.trim()) {
    throw new Error(
      `Markdown save test failed: content mismatch. Expected "${content.trim()}", got "${parsed.content.trim()}"`
    );
  }

  console.log("Markdown save test passed.");
}
