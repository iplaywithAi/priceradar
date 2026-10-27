import { useState } from 'react';
import { useAdmin } from './AdminContext.jsx';
import { CategoryOptions, FormDialog, SourceOptions } from './ui.jsx';

export const INTERVAL_PRESETS = [
  [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [180, '3 hours'],
  [360, '6 hours'], [720, '12 hours'], [1440, '24 hours'],
];

const SELECTOR_FIELDS = [
  ['item', 'Product card (container)', true],
  ['name', 'Product name', true],
  ['price', 'Current price', false],
  ['oldPrice', 'Old price', false],
  ['discount', 'Discount badge', false],
  ['rating', 'Rating element', false],
  ['link', 'Product link (a tag)', false],
  ['image', 'Product image', false],
];

/* ---------- Store ---------- */

function toSourceForm(values = {}) {
  return {
    name: values.name ?? '',
    currency: values.currency ?? 'KES',
    baseUrl: values.base_url ?? values.baseUrl ?? '',
    searchUrlTemplate: values.search_url_template ?? values.searchUrlTemplate ?? '',
    selectors: Object.fromEntries(SELECTOR_FIELDS.map(([key]) => [key, values.selectors?.[key] ?? ''])),
  };
}

export function SourceDialog({ source = null, onClose, onDone }) {
  const { lookups, request } = useAdmin();
  const [preset, setPreset] = useState(lookups.presets[0]?.key ?? '');
  const [form, setForm] = useState(() => toSourceForm(source ?? lookups.presets[0] ?? {}));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setSelector = (key) => (e) => setForm((f) => ({ ...f, selectors: { ...f.selectors, [key]: e.target.value } }));

  function pickPreset(key) {
    setPreset(key);
    setForm(toSourceForm(lookups.presets.find((p) => p.key === key) ?? {}));
  }

  async function onSubmit(fd) {
    const selectors = {};
    for (const [key] of SELECTOR_FIELDS) selectors[key] = form.selectors[key].trim();
    const payload = {
      name: form.name,
      baseUrl: form.baseUrl,
      searchUrlTemplate: form.searchUrlTemplate,
      currency: form.currency,
      enabled: fd.has('enabled'),
      selectors,
    };
    return source
      ? request(`/api/admin/sources/${source.id}`, { method: 'PUT', body: payload })
      : request('/api/admin/sources', { method: 'POST', body: payload });
  }

  return (
    <FormDialog
      title={source ? `Edit ${source.name}` : 'Add a store'}
      submitLabel={source ? 'Save changes' : 'Add store'}
      onSubmit={onSubmit} onDone={onDone} onClose={onClose}
    >
      {source ? null : (
        <label className="field full">Start from
          <select name="preset" value={preset} onChange={(e) => pickPreset(e.target.value)}>
            {lookups.presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
      )}
      <div className="form-grid">
        <label className="field">Store name *
          <input name="name" required maxLength={80} value={form.name} onChange={set('name')} />
        </label>
        <label className="field">Currency code *
          <input name="currency" required maxLength={3} style={{ textTransform: 'uppercase' }} value={form.currency} onChange={set('currency')} />
        </label>
        <label className="field full">Base URL *
          <input name="baseUrl" type="url" required placeholder="https://www.example.com" value={form.baseUrl} onChange={set('baseUrl')} />
        </label>
        <label className="field full">Search URL template *
          <input name="searchUrlTemplate" required placeholder="https://www.example.com/search?q={query}&page={page}"
            value={form.searchUrlTemplate} onChange={set('searchUrlTemplate')} />
          <span className="hint-text">{'{query}'} is replaced by the category search term. {'{page}'} is replaced by the page number.</span>
        </label>
        <details className="selectors full" open>
          <summary>CSS selectors</summary>
          <p className="hint-text" style={{ margin: '8px 0 12px' }}>
            In Chrome, right click a product, choose Inspect, then copy the selector for each part. Leave optional ones blank if the site does not show them.
          </p>
          <div className="form-grid">
            {SELECTOR_FIELDS.map(([key, label, required]) => (
              <label className="field" key={key}>{label}{required ? ' *' : ''}
                <input name={`sel_${key}`} required={required} placeholder={key === 'link' ? 'a' : ''}
                  value={form.selectors[key]} onChange={setSelector(key)} />
              </label>
            ))}
          </div>
        </details>
        <label className="check full">
          <input type="checkbox" name="enabled" defaultChecked={!source || source.enabled} /> Enabled
        </label>
      </div>
    </FormDialog>
  );
}

/* ---------- Category ---------- */

export function CategoryDialog({ category = null, onClose, onDone }) {
  const { request } = useAdmin();

  async function onSubmit(fd) {
    const payload = { name: fd.get('name'), searchTerm: fd.get('searchTerm'), emoji: fd.get('emoji') };
    return category
      ? request(`/api/admin/categories/${category.id}`, { method: 'PUT', body: payload })
      : request('/api/admin/categories', { method: 'POST', body: payload });
  }

  return (
    <FormDialog title={category ? `Edit ${category.name}` : 'New category'} onSubmit={onSubmit} onDone={onDone} onClose={onClose}>
      <div className="form-grid">
        <label className="field">Name *
          <input name="name" required maxLength={60} defaultValue={category?.name ?? ''} />
        </label>
        <label className="field">Icon (emoji)
          <input name="emoji" maxLength={8} defaultValue={category?.emoji ?? ''} />
        </label>
        <label className="field full">Search term *
          <input name="searchTerm" required maxLength={120} defaultValue={category?.searchTerm ?? ''} placeholder="e.g. sneakers" />
          <span className="hint-text">The word sent to each store's search. Changing it affects future scrapes only.</span>
        </label>
      </div>
    </FormDialog>
  );
}

/* ---------- Schedule ---------- */

export function ScheduleDialog({ schedule = null, onClose, onDone }) {
  const { request } = useAdmin();
  const presetValues = INTERVAL_PRESETS.map(([m]) => m);
  const current = schedule?.intervalMinutes ?? 360;
  const isCustom = !presetValues.includes(current);
  const [preset, setPreset] = useState(isCustom ? 'custom' : String(current));
  const custom = preset === 'custom';

  async function onSubmit(fd) {
    const payload = {
      sourceId: fd.get('sourceId'),
      categoryId: fd.get('categoryId'),
      maxPages: Number(fd.get('maxPages')),
      intervalMinutes: custom ? Number(fd.get('customInterval')) : Number(preset),
      enabled: fd.has('enabled'),
    };
    return schedule
      ? request(`/api/admin/schedules/${schedule.id}`, { method: 'PUT', body: payload })
      : request('/api/admin/schedules', { method: 'POST', body: payload });
  }

  return (
    <FormDialog
      title={schedule ? 'Edit schedule' : 'New schedule'}
      submitLabel={schedule ? 'Save schedule' : 'Create schedule'}
      onSubmit={onSubmit} onDone={onDone} onClose={onClose}
    >
      <div className="form-grid">
        <label className="field">Store *
          <select name="sourceId" required defaultValue={schedule?.sourceId}><SourceOptions /></select>
        </label>
        <label className="field">Category *
          <select name="categoryId" required defaultValue={schedule?.categoryId}><CategoryOptions /></select>
        </label>
        <label className="field">Run every
          <select name="intervalPreset" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {INTERVAL_PRESETS.map(([m, label]) => <option key={m} value={String(m)}>{label}</option>)}
            <option value="custom">Custom minutes</option>
          </select>
        </label>
        <label className="field" hidden={!custom}>Minutes (5 to 10080)
          <input name="customInterval" type="number" min="5" max="10080" required={custom} defaultValue={isCustom ? current : ''} />
        </label>
        <label className="field">Search pages per run *
          <input name="maxPages" type="number" min="1" max="50" required defaultValue={schedule?.maxPages ?? 3} />
        </label>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" name="enabled" defaultChecked={!schedule || schedule.enabled} /> Enabled
        </label>
      </div>
      <p className="hint-text">The first run starts on the next scheduler check. After that it repeats on the interval you choose.</p>
    </FormDialog>
  );
}
