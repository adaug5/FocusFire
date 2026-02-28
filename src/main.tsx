import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { DraftManager, LibraryManager, type LibraryDocument } from '../packages/focusdoc-engine'
import { useFocusDoc } from './hooks/useFocusDoc'
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

const library = new LibraryManager();
(window as any).library = library;

const App = () => {
  const debugLogged = useRef(false);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string>('');

  const {
    content,
    metadata,
    history,
    updateDraft,
    finalizeCommit,
  } = useFocusDoc(activeDocumentId);

  // Bootstrap document list and default selection
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const list = await library.listDocuments();
      if (!mounted) return;
      setDocuments(list);
      if (list.length > 0) {
        setActiveDocumentId(list[0].id);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const handleNewDocument = async () => {
    const newId = await library.createDocument('Untitled');
    setDocuments(await library.listDocuments());
    setActiveDocumentId(newId);
  };

  const handleCommit = async () => {
    const message = window.prompt('Commit message:', 'Update');
    if (message != null && message.trim()) {
      await finalizeCommit(message.trim());
    }
  };

  // Debug: expose engine on window (current doc's DraftManager)
  useEffect(() => {
    if (!activeDocumentId) {
      (window as any).focusDoc = null;
      return;
    }
    if (!debugLogged.current) {
      console.log("FocusDoc Engine ready. window.library and window.focusDoc (current doc) available.");
      debugLogged.current = true;
    }
    let cancelled = false;
    const initEngine = async () => {
      try {
        const draftManager = DraftManager.getInstance(activeDocumentId);
        await draftManager.ensureDraftReady();
        if (!cancelled) (window as any).focusDoc = draftManager;
      } catch (err) {
        if (!cancelled) console.error("Engine init:", err);
      }
    };
    initEngine();
    return () => { cancelled = true; };
  }, [activeDocumentId]);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        borderRight: '1px solid #e0e0e0',
        padding: 12,
        overflowY: 'auto',
        background: '#fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>Documents</strong>
          <button
            type="button"
            onClick={handleNewDocument}
            style={{ padding: '4px 10px', cursor: 'pointer' }}
          >
            New
          </button>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {documents.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => setActiveDocumentId(doc.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: 4,
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  borderRadius: 6,
                  background: activeDocumentId === doc.id ? '#e3f2fd' : 'transparent',
                }}
              >
                {doc.title || doc.id}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main: editor + toolbar + history */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e0e0e0',
          background: '#fff',
          display: 'flex',
          gap: 8,
        }}>
          <button
            type="button"
            onClick={handleCommit}
            style={{ padding: '6px 14px', cursor: 'pointer' }}
          >
            Commit
          </button>
        </div>

        {/* Editor + History row */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Editor */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <textarea
              value={content}
              onChange={(e) => updateDraft(e.target.value)}
              placeholder={activeDocumentId ? 'Start typing…' : 'Select or create a document'}
              disabled={!activeDocumentId}
              style={{
                flex: 1,
                padding: 16,
                border: 'none',
                resize: 'none',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            />
          </section>

          {/* History rail */}
          <aside style={{
            width: 260,
            borderLeft: '1px solid #e0e0e0',
            padding: 12,
            overflowY: 'auto',
            background: '#fafafa',
          }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>History</strong>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {history.map((entry) => (
                <li
                  key={entry.sha}
                  style={{
                    padding: '8px 10px',
                    marginBottom: 4,
                    background: '#fff',
                    borderRadius: 6,
                    border: '1px solid #eee',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{entry.message}</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
