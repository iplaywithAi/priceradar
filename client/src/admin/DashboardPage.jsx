import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast.jsx';
import { timeAgo } from '../lib/format.js';
import { useTitle } from '../lib/hooks.js';
import { useAdmin, useAdminResource } from './AdminContext.jsx';
import RunsTable from './RunsTable.jsx';
import { CategoryOptions, PageHead, SourceOptions, loadingOrError } from './ui.jsx';

function StatCard({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function LiveBox({ scheduler }) {
  const { running, queued } = scheduler;
  return (
    <section className="panel">
      <div className="panel-head"><h2>Live scraper status</h2></div>
      {running ? (
        <>
          <p><span className="badge run">Running</span> <strong>{running.label}</strong></p>
          <p className="small muted" style={{ marginTop: 6 }}>Started {timeAgo(running.startedAt)} ({running.trigger})</p>
        </>
      ) : <p><span className="badge ok">Idle</span> No scrape is running right now.</p>}
      <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Waiting in queue ({queued.length})</h3>
      {queued.length ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {queued.map((j, i) => <li key={i}>{j.label} <span className="muted small">({j.trigger})</span></li>)}
        </ul>
      ) : <p className="muted small">Nothing waiting.</p>}
      <p className="hint-text" style={{ marginTop: 18 }}>
        Due schedules are queued automatically. Only one scrape runs at a time so the browser stays light.
      </p>
    </section>
  );
}

export default function DashboardPage() {
  useTitle('PriceRadar Admin');
  const toast = useToast();
  const { request, scheduler, refresh } = useAdmin();
  const resource = useAdminResource(
    (signal) => Promise.all([request('/api/admin/stats', { signal }), request('/api/admin/runs?limit=8', { signal })]),
    [],
  );
  const blocked = loadingOrError(resource);
  if (blocked) return blocked;

  const [stats, runs] = resource.data;
  const live = scheduler ?? stats.scheduler;

  async function startScrape(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      await request('/api/admin/scrape', {
        method: 'POST',
        body: { sourceId: fd.get('sourceId'), categoryId: fd.get('categoryId'), maxPages: Number(fd.get('maxPages')) },
      });
      toast('Scrape queued');
      setTimeout(refresh, 600);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHead title="Dashboard" subtitle="Scraping activity and the product database at a glance.">
        <a className="btn ghost" href="/" target="_blank" rel="noopener">Open shop ↗</a>
      </PageHead>
      <div className="stat-grid">
        <StatCard label="Products" value={stats.products.toLocaleString('en-US')} hint={`${stats.hiddenProducts} hidden`} />
        <StatCard label="Stores" value={stats.sources} hint="Configured sources" />
        <StatCard label="Categories" value={stats.categories} />
        <StatCard label="Active schedules" value={stats.activeSchedules} hint="Running on their own interval" />
        <StatCard label="Runs, last 24h" value={stats.runs24h} />
        <StatCard label="Failures, last 24h" value={stats.failures24h} hint={stats.failures24h ? 'Open run history to see why' : 'All clear'} />
      </div>
      <div className="two-col">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Run a scrape now</h2></div>
            <form className="form-grid" onSubmit={startScrape}>
              <label className="field">Store<select name="sourceId" required><SourceOptions /></select></label>
              <label className="field">Category<select name="categoryId" required><CategoryOptions /></select></label>
              <label className="field">Pages<input name="maxPages" type="number" min="1" max="50" defaultValue="3" required /></label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" type="submit">Start scrape</button></div>
            </form>
            <p className="hint-text" style={{ marginTop: 10 }}>A one-off run. It joins the queue if another scrape is already running.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Recent runs</h2><Link to="/admin/runs">View all →</Link></div>
            <RunsTable runs={runs} compact />
          </section>
        </div>
        <LiveBox scheduler={live} />
      </div>
    </>
  );
}
