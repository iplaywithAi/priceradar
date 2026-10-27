import { useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { useTitle } from '../lib/hooks.js';
import { useAdmin, useAdminResource } from './AdminContext.jsx';
import { CategoryDialog } from './dialogs.jsx';
import { AdminEmpty, PageHead, loadingOrError } from './ui.jsx';

export default function CategoriesPage() {
  useTitle('Categories | PriceRadar Admin');
  const toast = useToast();
  const { request, reloadLookups } = useAdmin();
  const [dialog, setDialog] = useState(null);
  const resource = useAdminResource((signal) => request('/api/admin/categories', { signal }), []);
  const blocked = loadingOrError(resource);
  if (blocked) return blocked;
  const rows = resource.data;

  async function remove(c) {
    if (!window.confirm(`Delete the category "${c.name}"? Its schedules are removed too.`)) return;
    try {
      await request(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
      toast('Category deleted');
      await reloadLookups();
      resource.reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Categories" subtitle="Product groups for the shop. The search term is what gets typed into each store.">
        <button className="btn" type="button" onClick={() => setDialog({})}>+ New category</button>
      </PageHead>

      {rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Category</th><th>Search term</th><th>Products</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.emoji || ''} {c.name}</strong></td>
                  <td><code>{c.searchTerm}</code></td>
                  <td className="num">{c.productCount}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn small-btn ghost" type="button" onClick={() => setDialog({ category: c })}>Edit</button>{' '}
                    <button className="btn small-btn ghost" type="button" style={{ color: 'var(--bad)' }} onClick={() => remove(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <AdminEmpty icon="🏷️" title="No categories yet" text="Create one, such as Shoes or Electronics." />}

      {dialog ? <CategoryDialog category={dialog.category} onClose={() => setDialog(null)} onDone={resource.reload} /> : null}
    </>
  );
}
