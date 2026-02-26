import { useCallback, useState } from "react";
// Adapter: bridge to UI-agnostic engine (no UI imports inside packages/focusdoc-engine)
// import { ... } from "../../packages/focusdoc-engine";

/**
 * Adapter hook: bridges FocusDoc engine and React.
 * Components use this instead of touching the engine directly.
 * @see packages/focusdoc-engine
 */
export function useFocusDoc() {
  const [ready, setReady] = useState(false);

  const save = useCallback(() => {
    // TODO: call engine API when public API is defined
  }, []);

  return { ready, save };
}
