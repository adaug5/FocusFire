import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { DraftManager } from '../packages/focusdoc-engine'
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

const App = () => {
  useEffect(() => {
    const initEngine = async () => {
      try {
        console.log("Initializing FocusDoc Engine...");
        const draftManager = DraftManager.getInstance("test-doc-123");
        await draftManager.ensureDraftReady();

        (window as any).focusDoc = draftManager;

        console.log("✅ Engine Initialized! Try: await focusDoc.updateDraft('# Hello', { title: 'My Doc' }); await focusDoc.finalizeCommit('First release');");
      } catch (err) {
        console.error("❌ Engine failed to start:", err);
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