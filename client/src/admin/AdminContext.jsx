import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { useResource } from '../lib/hooks.js';

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

/**
 * Like useResource, but also reloads whenever a scrape finishes
 * (the scheduler poll bumps `refreshKey`).
 */
export function useAdminResource(loader, deps = []) {
  const { refreshKey } = useAdmin();
  return useResource(loader, [...deps, refreshKey]);
}

export function AdminProvider({ children }) {
  const toast = useToast();
  const [status, setStatus] = useState('checking'); // checking | out | in
  const [ready, setReady] = useState(false); // lookups loaded
  const [lookups, setLookups] = useState({ sources: [], categories: [], presets: [] });
  const [scheduler, setScheduler] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const statusRef = useRef('checking');
  const wasRunning = useRef(false);
  const pollRef = useRef(null);

  const changeStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Every admin call goes through here: a 401 sends the admin back to sign in. */
  const request = useCallback(async (path, options) => {
    try {
      return await api(path, options);
    } catch (err) {
      if (err.status === 401 && statusRef.current === 'in') {
        changeStatus('out');
        toast('Your session has ended. Please sign in again.', 'error');
      }
      throw err;
    }
  }, [toast, changeStatus]);

  const reloadLookups = useCallback(async () => {
    const [sources, categories, presets] = await Promise.all([
      request('/api/admin/sources'), request('/api/admin/categories'), request('/api/admin/presets'),
    ]);
    setLookups({ sources, categories, presets });
  }, [request]);

  /** Re-check the scheduler now and reload whatever page is open. */
  const refresh = useCallback(() => {
    pollRef.current?.();
    setRefreshKey((k) => k + 1);
  }, []);

  const login = useCallback(async (username, password) => {
    await api('/api/admin/login', { method: 'POST', body: { username, password } });
    changeStatus('in');
  }, [changeStatus]);

  const logout = useCallback(async () => {
    await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
    changeStatus('out');
  }, [changeStatus]);

  /* Is there already a session? */
  useEffect(() => {
    let off = false;
    api('/api/admin/session')
      .then(() => { if (!off) changeStatus('in'); })
      .catch(() => { if (!off) changeStatus('out'); });
    return () => { off = true; };
  }, [changeStatus]);

  /* While signed in: load lookups, then poll the scheduler every 8 seconds */
  useEffect(() => {
    if (status !== 'in') {
      setReady(false);
      setScheduler(null);
      wasRunning.current = false;
      return undefined;
    }
    let stop = false;

    reloadLookups().catch(() => {}).finally(() => { if (!stop) setReady(true); });

    const poll = async () => {
      try {
        const stats = await request('/api/admin/stats');
        if (stop) return;
        setScheduler(stats.scheduler);
        const running = !!stats.scheduler.running;
        // When a run finishes, reload the open page so its result shows up.
        if (wasRunning.current && !running) setRefreshKey((k) => k + 1);
        wasRunning.current = running;
      } catch {
        /* ignore transient failures, the next poll retries */
      }
    };
    pollRef.current = poll;
    poll();
    const timer = setInterval(poll, 8000);
    return () => { stop = true; clearInterval(timer); pollRef.current = null; };
  }, [status, request, reloadLookups]);

  const value = {
    status, ready, lookups, scheduler, refreshKey,
    request, reloadLookups, refresh, login, logout,
  };
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
