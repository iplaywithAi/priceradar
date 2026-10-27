import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ui.jsx';
import { AdminProvider, useAdmin } from './AdminContext.jsx';
import { Loading } from './ui.jsx';

const NAV = [
  ['/admin/dashboard', '📊', 'Dashboard'],
  ['/admin/schedules', '⏱️', 'Schedules'],
  ['/admin/sources', '🏬', 'Stores'],
  ['/admin/categories', '🏷️', 'Categories'],
  ['/admin/products', '📦', 'Products'],
  ['/admin/runs', '🧾', 'Run history'],
];

function LoginPage() {
  const { login } = useAdmin();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await login(fd.get('username'), fd.get('password'));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="center-page">
      <form className="login-card" autoComplete="on" onSubmit={handleSubmit}>
        <Link className="brand" to="/"><span className="logo">◎</span><span>PriceRadar Admin</span></Link>
        <div>
          <h1>Sign in</h1>
          <p className="muted small" style={{ marginTop: 4 }}>Use the admin username and password from your .env file.</p>
        </div>
        <label className="field">Username <input name="username" autoComplete="username" required /></label>
        <label className="field">Password <input name="password" type="password" autoComplete="current-password" required /></label>
        <div className="form-error" role="alert">{error}</div>
        <button className="btn" type="submit" disabled={busy}>Sign in</button>
      </form>
    </section>
  );
}

function SchedulerStatus() {
  const { scheduler } = useAdmin();
  if (!scheduler) return <>Checking scheduler…</>;
  if (scheduler.running) return <><span className="badge run">Scraping</span> {scheduler.running.label}</>;
  return <><span className="badge ok">Idle</span>{scheduler.queued.length ? ` · ${scheduler.queued.length} queued` : ''}</>;
}

function AdminLayout() {
  const { ready, logout } = useAdmin();
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link className="brand" to="/"><span className="logo">◎</span><span className="word">PriceRadar</span></Link>
        <nav className="nav">
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={to}>{icon} <span>{label}</span></NavLink>
          ))}
        </nav>
        <div className="foot">
          <div className="small muted"><SchedulerStatus /></div>
          <ThemeToggle />
          <Link className="btn ghost small-btn" to="/">View shop</Link>
          <button className="btn ghost small-btn" type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main" aria-live="polite">
        {ready ? <Outlet /> : <Loading />}
      </main>
    </div>
  );
}

function AdminGate() {
  const { status } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  // Keep the admin out of search engines
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'PriceRadar Admin';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.title = previousTitle; meta.remove(); };
  }, []);

  // Old bookmarks looked like /admin/#/schedules
  useEffect(() => {
    if (location.hash.startsWith('#/')) navigate(`/admin/${location.hash.slice(2)}`, { replace: true });
  }, [location.hash, navigate]);

  if (status === 'checking') return null;
  if (status === 'out') return <LoginPage />;
  return <AdminLayout />;
}

export default function AdminShell() {
  return (
    <AdminProvider>
      <AdminGate />
    </AdminProvider>
  );
}
