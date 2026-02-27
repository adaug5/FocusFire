import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { DraftManager } from '../packages/focusdoc-engine'
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

const App = () => {
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const initEngine = async () => {
      try {
        console.log("Initializing FocusDoc Engine...");
        const draftManager = DraftManager.getInstance("test-doc-123");
        await draftManager.ensureDraftReady();

        (window as any).focusDoc = draftManager;

        console.log("✅ Engine Initialized! Try: await focusDoc.updateDraft('# Hello', { title: 'My Doc' }); await focusDoc.finalizeCommit('First release'); await focusDoc.getRefs(); focusDoc.getFsAndDir().fs.promises.readdir('/refs/heads');");
      } catch (err) {
        console.error("❌ Engine failed to start:", err);
        initStarted.current = false;
      }
    };

    initEngine();
  }, []);

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>FocusDoc Engine is Active</h1>
      <p>Check the <b>Console</b> for the "✅" message, then refresh the <b>IndexedDB</b> view.</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)