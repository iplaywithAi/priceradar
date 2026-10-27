import { useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { useTitle } from '../lib/hooks.js';
import { useAdmin, useAdminResource } from './AdminContext.jsx';
import RunsTable from './RunsTable.jsx';
import { PageHead, loadingOrError } from './ui.jsx';

export default function RunsPage() {
  useTitle('Run history | PriceRadar Admin');
  const toast = useToast();
  const { request } = useAdmin();
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState({}); // run id -> 'loading' | run detail

  const resource = useAdminResource(
    (signal) => request(`/api/admin/runs?limit=100${status ? `&status=${status}` : ''}`, { signal }),
    [status],
  );
  const blocked = loadingOrError(resource);
  if (blocked) return blocked;

  async function toggle(id) {
    if (id in expanded) {
      setExpanded(({ [id]: _closed, ...rest }) => rest);
      return;
    }
    setExpanded((e) => ({ ...e, [id]: 'loading' }));
    try {
      const run = await request(`/api/admin/runs/${id}`);
      setExpanded((e) => (id in e ? { ...e, [id]: run } : e));
    } catch (err) {
      setExpanded(({ [id]: _failed, ...rest }) => rest);
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHead title="Run history" subtitle="Every scrape, scheduled or manual. Click a run to read its log.">
        <select style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['success', 'failed', 'running'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </PageHead>
      <RunsTable runs={resource.data} expanded={expanded} onToggle={toggle} />
    </>
  );
}
