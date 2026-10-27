import { useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { formatInterval, timeAgo } from '../lib/format.js';
import { useTitle } from '../lib/hooks.js';
import { useAdmin, useAdminResource } from './AdminContext.jsx';
import { ScheduleDialog } from './dialogs.jsx';
import { AdminEmpty, PageHead, StatusBadge, loadingOrError } from './ui.jsx';

export default function SchedulesPage() {
  useTitle('Schedules | PriceRadar Admin');
  const toast = useToast();
  const { request, refresh } = useAdmin();
  const [dialog, setDialog] = useState(null); // null = closed, {} = new, { schedule } = edit
  const resource = useAdminResource((signal) => request('/api/admin/schedules', { signal }), []);
  const blocked = loadingOrError(resource);
  if (blocked) return blocked;
  const rows = resource.data;

  const fail = (err) => toast(err.message, 'error');

  async function runNow(r) {
    try {
      await request(`/api/admin/schedules/${r.id}/run`, { method: 'POST', body: {} });
      toast('Queued. Watch the live status on the dashboard.');
      setTimeout(refresh, 500);
    } catch (err) { fail(err); }
  }

  async function remove(r) {
    if (!window.confirm('Delete this schedule? Past run history is kept.')) return;
    try {
      await request(`/api/admin/schedules/${r.id}`, { method: 'DELETE' });
      toast('Schedule deleted');
      resource.reload();
    } catch (err) { fail(err); }
  }

  async function toggle(r, enabled) {
    try {
      await request(`/api/admin/schedules/${r.id}`, {
        method: 'PUT',
        body: { sourceId: r.sourceId, categoryId: r.categoryId, maxPages: r.maxPages, intervalMinutes: r.intervalMinutes, enabled },
      });
      toast(enabled ? 'Schedule resumed' : 'Schedule paused');
      resource.reload();
    } catch (err) { fail(err); }
  }

  const addButton = (style) => (
    <button className="btn" type="button" style={style} onClick={() => setDialog({})}>+ New schedule</button>
  );

  return (
    <>
      <PageHead title="Schedules" subtitle="Set how often each store and category is scraped. Each run visits the number of search pages you choose.">
        {addButton()}
      </PageHead>

      {rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Store</th><th>Category</th><th>Frequency</th><th>Pages</th>
                <th>Next run</th><th>Last run</th><th>Last result</th><th>On</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.sourceName}</strong></td>
                  <td>{r.categoryEmoji || ''} {r.categoryName}</td>
                  <td>{formatInterval(r.intervalMinutes)}</td>
                  <td className="num">{r.maxPages}</td>
                  <td>{r.enabled && r.nextRunAt ? timeAgo(r.nextRunAt) : <span className="muted">Paused</span>}</td>
                  <td>{timeAgo(r.lastRunAt)}</td>
                  <td><StatusBadge status={r.lastStatus} /></td>
                  <td>
                    <label className="switch" title="Enable or pause">
                      <input type="checkbox" checked={!!r.enabled} onChange={(e) => toggle(r, e.target.checked)} /><span></span>
                    </label>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn small-btn ghost" type="button" onClick={() => runNow(r)}>Run now</button>{' '}
                    <button className="btn small-btn ghost" type="button" onClick={() => setDialog({ schedule: r })}>Edit</button>{' '}
                    <button className="btn small-btn ghost" type="button" style={{ color: 'var(--bad)' }} onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty icon="⏱️" title="No schedules yet" text="Create one to scrape a category from a store automatically.">
          {addButton({ margin: '16px auto 0' })}
        </AdminEmpty>
      )}

      {dialog ? <ScheduleDialog schedule={dialog.schedule} onClose={() => setDialog(null)} onDone={resource.reload} /> : null}
    </>
  );
}
