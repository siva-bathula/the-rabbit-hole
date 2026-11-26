import { useState, useCallback, useRef } from 'react';

const DEFAULT_HOLD_MS = 1400;
const DEFAULT_FADE_MS = 1800;

/**
 * Brief status line for toolbar / graph actions — stays visible, then fades out slowly.
 */
export function useActionStatus() {
  const [state, setState] = useState(null);
  const timersRef = useRef({ hold: null, remove: null });

  const clearTimers = useCallback(() => {
    clearTimeout(timersRef.current.hold);
    clearTimeout(timersRef.current.remove);
    timersRef.current.hold = null;
    timersRef.current.remove = null;
  }, []);

  const show = useCallback(
    (message, options = {}) => {
      if (!message) return;
      clearTimers();

      const persist = Boolean(options.persist);
      const holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
      const fadeMs = options.fadeMs ?? DEFAULT_FADE_MS;

      setState({ message, fading: false });

      if (persist) return;

      timersRef.current.hold = setTimeout(() => {
        setState((s) => (s?.message === message ? { ...s, fading: true } : s));
        timersRef.current.remove = setTimeout(() => {
          setState((s) => (s?.message === message ? null : s));
        }, fadeMs);
      }, holdMs);
    },
    [clearTimers],
  );

  const clear = useCallback(() => {
    clearTimers();
    setState((s) => (s ? { ...s, fading: true } : null));
    timersRef.current.remove = setTimeout(() => setState(null), DEFAULT_FADE_MS);
  }, [clearTimers]);

  return {
    message: state?.message ?? null,
    fading: state?.fading ?? false,
    show,
    clear,
  };
}