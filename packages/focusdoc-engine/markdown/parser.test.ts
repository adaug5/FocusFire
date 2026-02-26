/**
 * Unit tests for parseDocument and stringifyDocument.
 * Run with: npx tsx markdown/parser.test.ts
 * Or with Node (if using a loader): node --import tsx markdown/parser.test.ts
 */

import assert from "node:assert";
import {
  parseDocument,
  stringifyDocument,
} from "./parser";

function runTests(): void {
  // --- parseDocument: extract frontmatter and content ---
  const withFrontmatter = `---
title: Hello World
status: draft
tags:
  - a
  - b
---
# Heading

Body text here.
`;
  const parsed = parseDocument(withFrontmatter);
  assert.strictEqual(parsed.metadata.title, "Hello World");
  assert.strictEqual(parsed.metadata.status, "draft");
  assert.deepStrictEqual(parsed.metadata.tags, ["a", "b"]);
  assert.ok(parsed.content.includes("# Heading"));
  assert.ok(parsed.content.includes("Body text here."));

  // --- parseDocument: no frontmatter -> empty metadata ---
  const noFrontmatter = "# Only markdown\nNo YAML.";
  const parsed2 = parseDocument(noFrontmatter);
  assert.strictEqual(Object.keys(parsed2.metadata).length, 0);
  assert.strictEqual(parsed2.content.trim(), "# Only markdown\nNo YAML.");

  // --- stringifyDocument then parseDocument: round-trip preserves data ---
  const metadata = { title: "Test", count: 42, nested: { key: "value" } };
  const content = "Paragraph one.\n\nParagraph two.";
  const serialized = stringifyDocument(metadata, content);
  assert.ok(serialized.startsWith("---"));
  assert.ok(serialized.includes("title: Test"));
  assert.ok(serialized.includes("Paragraph one."));

  const roundTrip = parseDocument(serialized);
  assert.strictEqual(roundTrip.metadata.title, "Test");
  assert.strictEqual(roundTrip.metadata.count, 42);
  assert.deepStrictEqual(roundTrip.metadata.nested, { key: "value" });
  assert.strictEqual(roundTrip.content.trim(), content.trim());

  // --- stringifyDocument: empty metadata still produces valid delimiters ---
  const emptyDoc = stringifyDocument({}, "Body only.");
  assert.ok(emptyDoc.startsWith("---\n---"));
  assert.ok(emptyDoc.includes("Body only."));
  const parsedEmpty = parseDocument(emptyDoc);
  assert.strictEqual(Object.keys(parsedEmpty.metadata).length, 0);
  assert.strictEqual(parsedEmpty.content.trim(), "Body only.");

  console.log("All parser tests passed.");
}

runTests();
