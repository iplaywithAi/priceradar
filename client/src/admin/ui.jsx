import { useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { EmptyState } from '../components/ui.jsx';
import { useAdmin } from './AdminContext.jsx';

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="actions">{children}</div>
    </div>
  );
}

export const AdminEmpty = (props) => <EmptyState className="panel" {...props} />;

export function Loading() {
  return <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />;
}

/** Use at the top of a page: returns an element to render while loading or failed, otherwise null. */
export function loadingOrError({ data, error }) {
  if (error && !data) return <AdminEmpty icon="⚠️" title="Could not load this page" text={error.message} />;
  if (!data) return <Loading />;
  return null;
}

export function StatusBadge({ status }) {
  const map = { success: ['ok', 'Success'], failed: ['fail', 'Failed'], running: ['run', 'Running'] };
  const [cls, label] = map[status] || ['', status || 'Never run'];
  return <span className={`badge ${cls}`.trim()}>{label}</span>;
}

export function SourceOptions() {
  const { lookups } = useAdmin();
  return lookups.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>);
}

export function CategoryOptions() {
  const { lookups } = useAdmin();
  return lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji || ''} {c.name}</option>);
}

/**
 * A native <dialog> with a form. `onSubmit` receives the FormData and should throw to show an error.
 * On success it toasts, refreshes the store/category lookups, then calls onDone and onClose.
 */
export function FormDialog({ title, submitLabel = 'Save', onSubmit, onDone, onClose, children }) {
  const ref = useRef(null);
  const toast = useToast();
  const { reloadLookups } = useAdmin();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await onSubmit(formData);
      toast('Saved');
      await reloadLookups().catch(() => {});
      onClose();
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="modal" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form method="dialog" onSubmit={handleSubmit}>
        <h2>{title}</h2>
        {children}
        <div className="form-error" role="alert">{error}</div>
        <div className="form-actions">
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit" disabled={busy}>{submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
