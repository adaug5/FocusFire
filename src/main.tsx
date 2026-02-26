import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
// Import your engine - the path might need adjusting based on your exact structure
import { GitRepository } from '../packages/focusdoc-engine/git/repository'
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

const App = () => {
  useEffect(() => {
    // This function runs once when the page loads
    const initEngine = async () => {
      try {
        console.log("Initializing FocusDoc Engine...");
        const repo = new GitRepository("test-doc-123");
        await repo.initialize();
        
        // Expose it to the window so we can play with it in the console
        (window as any).focusDoc = repo;
        
        console.log("✅ Engine Initialized! Check IndexedDB now.");
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