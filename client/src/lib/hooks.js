import { useCallback, useEffect, useRef, useState } from 'react';

export function useTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}

/**
 * Runs an async loader whenever `deps` change and aborts the previous request.
 * The loader receives an AbortSignal. Previous data is kept while a reload is in flight.
 */
export function useResource(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef.current(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState((s) => ({ ...s, error, loading: false }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/**
 * A text field that mirrors `value` (usually from the URL) and only calls `commit`
 * after the user has stopped typing for `ms`.
 */
export function useDebouncedField(value, commit, ms = 450) {
  const [text, setText] = useState(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => commitRef.current(text), ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return [text, setText];
}
