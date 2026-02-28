import { useCallback, useEffect, useRef, useState } from "react";
import {
  DraftManager,
  DraftManagerEvents,
} from "../../packages/focusdoc-engine";

/** Conflict details emitted by the engine when finalize fails (main has new commits). */
export type ConflictDetails = {
  message: string;
  mainOid: string;
  draftOid: string;
  draftParent: string;
};

/** History entry shape from DraftManager.getHistory(). */
export type HistoryEntry = {
  sha: string;
  message: string;
  timestamp: number;
  author: string;
};

/**
 * Adapter hook: bridges FocusDoc engine and React.
 * Components use this instead of touching the engine directly.
 * @param documentId - Document id used for DraftManager singleton lookup.
 * @see packages/focusdoc-engine
 */
export function useFocusDoc(documentId: string) {
  const [content, setContent] = useState("");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [threads, setThreads] = useState<string[]>([]);
  const [conflict, setConflict] = useState<false | ConflictDetails>(false);
  const [ready, setReady] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    if (!documentId) return;

    mountedRef.current = true;
    const manager = DraftManager.getInstance(documentId);

    const handleSaved = async () => {
      if (!mountedRef.current) return;
      try {
        const doc = await manager.loadDocument();
        if (!mountedRef.current) return;
        setContent(doc.content);
        setMetadata(doc.metadata ?? {});
      } catch {
        // Ignore load errors; state stays as-is
      }
    };

    const handleFinalized = async () => {
      if (!mountedRef.current) return;
      setConflict(false);
      try {
        const [doc, hist, threadList] = await Promise.all([
          manager.loadDocument(),
          manager.getHistory(),
          manager.getThreads(),
        ]);
        if (!mountedRef.current) return;
        setContent(doc.content);
        setMetadata(doc.metadata ?? {});
        setHistory(hist);
        setThreads(threadList);
      } catch {
        // Ignore load errors
      }
    };

    const handleThreadSwitched = async () => {
      if (!mountedRef.current) return;
      try {
        const [doc, hist, threadList] = await Promise.all([
          manager.loadDocument(),
          manager.getHistory(),
          manager.getThreads(),
        ]);
        if (!mountedRef.current) return;
        setContent(doc.content);
        setMetadata(doc.metadata ?? {});
        setHistory(hist);
        setThreads(threadList);
      } catch {
        // Ignore load errors
      }
    };

    const handleConflict = (details: ConflictDetails) => {
      if (!mountedRef.current) return;
      setConflict(details);
    };

    manager.on(DraftManagerEvents.saved, handleSaved);
    manager.on(DraftManagerEvents.finalized, handleFinalized);
    manager.on(DraftManagerEvents.threadSwitched, handleThreadSwitched);
    manager.on(DraftManagerEvents.conflict, handleConflict);

    const init = async () => {
      try {
        await manager.ensureDraftReady();
        if (!mountedRef.current) return;
        const [doc, hist, threadList] = await Promise.all([
          manager.loadDocument(),
          manager.getHistory(),
          manager.getThreads(),
        ]);
        if (!mountedRef.current) return;
        setContent(doc.content);
        setMetadata(doc.metadata ?? {});
        setHistory(hist);
        setThreads(threadList);
      } catch {
        // Initial load failed; leave defaults
      } finally {
        if (mountedRef.current) setReady(true);
      }
    };
    init();

    return () => {
      mountedRef.current = false;
      manager.off(DraftManagerEvents.saved, handleSaved);
      manager.off(DraftManagerEvents.finalized, handleFinalized);
      manager.off(DraftManagerEvents.threadSwitched, handleThreadSwitched);
      manager.off(DraftManagerEvents.conflict, handleConflict);
    };
  }, [documentId]);

  const updateDraft = useCallback(
    async (newContent: string, newMetadata?: Record<string, unknown>) => {
      const manager = DraftManager.getInstance(documentId);
      await manager.updateDraft(newContent, newMetadata);
    },
    [documentId]
  );

  const finalizeCommit = useCallback(
    async (message: string) => {
      const manager = DraftManager.getInstance(documentId);
      await manager.finalizeCommit(message);
    },
    [documentId]
  );

  const createThread = useCallback(
    async (name: string) => {
      const manager = DraftManager.getInstance(documentId);
      await manager.createThread(name);
      const threadList = await manager.getThreads();
      setThreads(threadList);
    },
    [documentId]
  );

  return {
    content,
    metadata,
    history,
    threads,
    conflict,
    ready,
    updateDraft,
    finalizeCommit,
    createThread,
  };
}
