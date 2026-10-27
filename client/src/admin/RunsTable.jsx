import { Fragment } from 'react';
import { dateTime, duration } from '../lib/format.js';
import { AdminEmpty, StatusBadge } from './ui.jsx';

/**
 * Table of scrape runs. With `compact`, shows fewer columns and rows are not clickable.
 * `expanded` maps run id to its loaded detail (or 'loading') for the log rows.
 */
export default function RunsTable({ runs, compact = false, expanded = {}, onToggle }) {
  if (!runs.length) return <AdminEmpty icon="🧾" title="No runs yet" text="Start a scrape or wait for a schedule to run." />;
  const cols = compact ? 5 : 9;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Started</th><th>Store</th><th>Category</th>
            {compact ? null : <th>Trigger</th>}
            <th>Status</th><th>Found</th>
            {compact ? null : <><th>New</th><th>Price changes</th><th>Duration</th></>}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const open = r.id in expanded;
            const detail = expanded[r.id];
            return (
              <Fragment key={r.id}>
                <tr className={compact ? '' : `clickable ${open ? 'open' : ''}`.trim()} onClick={compact ? undefined : () => onToggle(r.id)}>
                  <td>{dateTime(r.startedAt)}</td>
                  <td>{r.sourceName}</td>
                  <td>{r.categoryName}</td>
                  {compact ? null : <td><span className="badge">{r.trigger}</span></td>}
                  <td>
                    <StatusBadge status={r.status} />
                    {r.error ? <div className="error-text small">{r.error.slice(0, 140)}</div> : null}
                  </td>
                  <td className="num">{r.productsFound}</td>
                  {compact ? null : (
                    <>
                      <td className="num">{r.productsNew}</td>
                      <td className="num">{r.productsChanged}</td>
                      <td>{duration(r.startedAt, r.finishedAt)}</td>
                    </>
                  )}
                </tr>
                {open ? (
                  <tr className="sub-row">
                    <td colSpan={cols}>
                      {detail === 'loading' ? <div className="small muted">Loading log…</div> : (
                        <>
                          <div className="small muted" style={{ marginBottom: 8 }}>
                            Pages scraped: {detail.pagesScraped} · Finished: {dateTime(detail.finishedAt)}
                            {detail.error ? <> · <span className="error-text">{detail.error}</span></> : null}
                          </div>
                          <pre className="log">{detail.log || 'No log was recorded for this run.'}</pre>
                        </>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
