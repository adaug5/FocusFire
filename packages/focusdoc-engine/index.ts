/**
 * FocusDoc Engine — Public API.
 * UI-agnostic core: git, markdown, draft-manager.
 * @see packages/focusdoc-engine/
 */

export { GitRepository } from "./git";
export { DraftManager } from "./draft-manager";
export {
  parseDocument,
  stringifyDocument,
  type ParsedDocument,
} from "./markdown";
