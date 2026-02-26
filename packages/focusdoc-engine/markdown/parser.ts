/**
 * Markdown + YAML frontmatter parser/stringify for FocusDoc.
 * Source of truth: .md file with YAML frontmatter (focusdoc-core.mdc).
 *
 * Verification (see markdown/parser.test.ts):
 * - parseDocument: frontmatter keys (title, status, tags, nested) are extracted into metadata; body is content.
 * - parseDocument: content without frontmatter yields empty metadata and full string as content.
 * - stringifyDocument: produces valid "---\n<yaml>\n---\n\n<content>"; empty metadata still uses "---\n---".
 * - Round-trip: stringifyDocument(metadata, content) then parseDocument(...) preserves metadata and content.
 */

import matter from "gray-matter";
import yaml from "js-yaml";

export interface ParsedDocument {
  metadata: Record<string, unknown>;
  content: string;
}

/**
 * Parses a raw Markdown string with optional YAML frontmatter.
 * @param rawContent - Full document string (frontmatter + body)
 * @returns Object with metadata (parsed YAML as JSON-like object) and content (body after frontmatter)
 */
export function parseDocument(rawContent: string): ParsedDocument {
  const parsed = matter(rawContent);
  const metadata =
    parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      ? (parsed.data as Record<string, unknown>)
      : {};
  return {
    metadata,
    content: parsed.content ?? "",
  };
}

/**
 * Merges metadata and content into a valid Markdown string with a YAML frontmatter block.
 * @param metadata - Key-value object (will be serialized as YAML; values should be JSON-serializable)
 * @param content - Markdown body (no leading delimiters)
 * @returns Full document string: "---\n<yaml>\n---\n\n<content>"
 */
export function stringifyDocument(
  metadata: Record<string, unknown>,
  content: string
): string {
  const yamlBlock =
    Object.keys(metadata).length === 0
      ? ""
      : yaml.dump(metadata, { lineWidth: -1 }).trimEnd();
  const frontmatter = yamlBlock ? `---\n${yamlBlock}\n---` : "---\n---";
  return `${frontmatter}\n\n${content}`;
}
