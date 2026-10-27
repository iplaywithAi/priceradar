import { useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { useTitle } from '../lib/hooks.js';
import { useAdmin, useAdminResource } from './AdminContext.jsx';
import { SourceDialog } from './dialogs.jsx';
import { AdminEmpty, PageHead, loadingOrError } from './ui.jsx';

export default function SourcesPage() {
  useTitle('Stores | PriceRadar Admin');
  const toast = useToast();
  const { request, reloadLookups } = useAdmin();
  const [dialog, setDialog] = useState(null);
  const resource = useAdminResource((signal) => request('/api/admin/sources', { signal }), []);
  const blocked = loadingOrError(resource);
  if (blocked) return blocked;
  const rows = resource.data;

  async function remove(s) {
    if (!window.confirm(`Delete ${s.name}? Its schedules and products will be removed too.`)) return;
    try {
      await request(`/api/admin/sources/${s.id}`, { method: 'DELETE' });
      toast('Store deleted');
      await reloadLookups();
      resource.reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Stores" subtitle="Websites PriceRadar scrapes. Each store needs a search URL and CSS selectors for its product cards.">
        <button className="btn" type="button" onClick={() => setDialog({})}>+ Add store</button>
      </PageHead>

      {rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Store</th><th>Currency</th><th>Products</th><th>Item selector</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="small muted"><a href={s.baseUrl} target="_blank" rel="noopener">{s.baseUrl}</a></div>
                  </td>
                  <td>{s.currency}</td>
                  <td className="num">{s.productCount}</td>
                  <td><code className="small">{s.selectors.item}</code></td>
                  <td>{s.enabled ? <span className="badge ok">Enabled</span> : <span className="badge">Disabled</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn small-btn ghost" type="button" onClick={() => setDialog({ source: s })}>Edit</button>{' '}
                    <button className="btn small-btn ghost" type="button" style={{ color: 'var(--bad)' }} onClick={() => remove(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <AdminEmpty icon="🏬" title="No stores yet" text="Add a store to start scraping." />}

      {dialog ? <SourceDialog source={dialog.source} onClose={() => setDialog(null)} onDone={resource.reload} /> : null}
    </>
  );
}
