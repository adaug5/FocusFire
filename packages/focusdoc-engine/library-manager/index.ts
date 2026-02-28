/**
 * Library manager: registry of known documents and lifecycle (create, list, delete).
 * Uses localStorage for the registry (focusfire_library); each document's data lives in its own IndexedDB (LightningFS).
 * @see focusfire-architecture.mdc — Engine layer, UI-agnostic.
 */

import { nanoid } from "nanoid";
import { DraftManager } from "../draft-manager";
import { getIndexedDBNameForDocument } from "../git/repository";

const REGISTRY_KEY = "focusfire_library";

export type LibraryDocument = {
  id: string;
  title: string;
  createdAt: number;
};

function getRegistry(): LibraryDocument[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LibraryDocument =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LibraryDocument).id === "string" &&
        typeof (entry as LibraryDocument).title === "string" &&
        typeof (entry as LibraryDocument).createdAt === "number"
    );
  } catch {
    return [];
  }
}

function setRegistry(entries: LibraryDocument[]): void {
  if (typeof localStorage === "undefined") {
    throw new Error("localStorage is not available.");
  }
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
}

/**
 * Manages the registry of documents and document lifecycle.
 * Decoupled from UI; uses localStorage for the registry and IndexedDB (per document) for content.
 */
export class LibraryManager {
  /**
   * Creates a new document: generates a unique ID with nanoid, adds metadata to the registry, returns the ID.
   */
  async createDocument(title: string): Promise<string> {
    const id = nanoid();
    const entry: LibraryDocument = { id, title, createdAt: Date.now() };
    const registry = getRegistry();
    registry.push(entry);
    setRegistry(registry);
    return id;
  }

  /**
   * Returns the current array of document metadata from the registry.
   */
  async listDocuments(): Promise<LibraryDocument[]> {
    return getRegistry();
  }

  /**
   * Removes the document from the registry and deletes its IndexedDB database (Git repository).
   */
  async deleteDocument(id: string): Promise<void> {
    const registry = getRegistry();
    const index = registry.findIndex((entry) => entry.id === id);
    if (index === -1) return;

    DraftManager.removeInstance(id);

    const dbName = getIndexedDBNameForDocument(id);
    if (typeof indexedDB !== "undefined" && indexedDB.deleteDatabase) {
      indexedDB.deleteDatabase(dbName);
    }

    registry.splice(index, 1);
    setRegistry(registry);
  }
}
