import { useMemo, useState } from 'react';
import { REVIEW_AFTER_DAYS, fmtDate, fmtTime, isStale, needsReview } from '../lib/format.js';
import { Icon, SourceTypeIcon } from './Icons.jsx';
import { RATINGS } from './FeedbackView.jsx';

/**
 * Knowledge sources page.
 * - api mode (`crawl` is set): the crawled PBS help pages from GET /api/sources, searchable and grouped by owner.
 * - mock mode: the sample knowledge base, with simulated re-sync.
 * Both show the staff feedback queue.
 */
export default function SourcesView({ crawl, sources, feedback, onOpenSource, onOpenPage, onResync, onAddSource }) {
  return (
    <section className="view">
      <div className="page">
        {crawl
          ? <CrawledSources crawl={crawl} feedback={feedback} onOpenPage={onOpenPage} />
          : <SampleSources sources={sources} feedback={feedback} onOpenSource={onOpenSource} onResync={onResync} onAddSource={onAddSource} />}
        <FeedbackQueue feedback={feedback} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- api mode

function CrawledSources({ crawl, feedback, onOpenPage }) {
  const [query, setQuery] = useState('');
  const pages = crawl.sources;

  const groups = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const byOwner = new Map();
    for (const p of pages) {
      const hay = [p.title, p.site, p.owner, ...p.breadcrumb].join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      if (!byOwner.has(p.owner)) byOwner.set(p.owner, []);
      byOwner.get(p.owner).push(p);
    }
    // PBS Wisconsin's own pages first, then the national PBS sites.
    return [...byOwner].sort(([a], [b]) => (a === 'PBS Wisconsin' ? -1 : b === 'PBS Wisconsin' ? 1 : a.localeCompare(b)));
  }, [pages, query]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);
  const totalPassages = pages.reduce((n, p) => n + p.passages, 0);

  return (
    <>
      <div className="page__intro">
        <p>
          The PBS help pages the assistant answers from. Anything not listed here, it won't answer.
          {crawl.lastCrawled && <> Last crawled <strong>{fmtDate(crawl.lastCrawled)}</strong>.</>}
        </p>
      </div>

      <Stats
        items={[
          { n: crawl.status === 'ready' ? pages.length : '–', label: 'Crawled pages' },
          { n: crawl.status === 'ready' ? totalPassages : '–', label: 'Searchable passages' },
          { n: crawl.lastCrawled ? fmtDate(crawl.lastCrawled) : '–', label: 'Last crawl', small: true },
        ]}
        feedback={feedback}
      />

      {crawl.status === 'loading' && (
        <div className="empty empty--small"><Icon name="refresh" /><p>Loading crawled sources…</p></div>
      )}
      {crawl.status === 'error' && (
        <div className="empty empty--small">
          <Icon name="alert" />
          <p><strong>Couldn't load the crawled sources.</strong></p>
          <p>Check that the backend is running, then reload the page.</p>
        </div>
      )}

      {crawl.status === 'ready' && (
        <>
          <div className="faq-toolbar">
            <label className="search">
              <Icon name="search" />
              <input
                type="search"
                value={query}
                placeholder="Search pages: Roku, activation, MVault…"
                aria-label="Search crawled pages"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {/* Result count is announced as the user types (WCAG 4.1.3). */}
            <p className="search-count" role="status">{query ? `${shown} of ${pages.length} pages` : ''}</p>
          </div>

          {groups.map(([owner, list]) => (
            <div key={owner} className="source-group">
              <h2 className="section-title">{owner} <span className="section-title__count">{list.length}<span className="sr-only"> pages</span></span></h2>
              <div className="table-card">
                <table className="sources-table sources-table--crawl">
                  <thead>
                    <tr>
                      <th scope="col">Page</th><th scope="col">Topic</th><th scope="col">Last updated</th>
                      <th scope="col">Crawled</th><th scope="col" className="num">Passages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button className="table-link" onClick={() => onOpenPage(p.id)}>
                            <SourceTypeIcon type="Web" />
                            <span>
                              <strong>{p.title}</strong>
                              <small>{p.site}{p.audience === 'station_staff' ? ' · for station staff' : ''}</small>
                            </span>
                          </button>
                        </td>
                        <td data-label="Topic">{p.topic || '–'}</td>
                        <td data-label="Updated">{fmtDate(p.updated)}</td>
                        <td data-label="Crawled">{fmtDate(p.crawled)}</td>
                        <td data-label="Passages" className="num">{p.passages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {shown === 0 && (
            <div className="empty empty--small">
              <Icon name="search" />
              <p><strong>No crawled pages match “{query}”.</strong></p>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- mock mode

function SampleSources({ sources, feedback, onOpenSource, onResync, onAddSource }) {
  const [syncing, setSyncing] = useState([]);
  const totalChunks = sources.reduce((n, s) => n + s.chunks, 0);
  const reviewDue = sources.filter((s) => isStale(s.updated)).length;

  const resync = (id) => {
    setSyncing((prev) => [...prev, id]);
    setTimeout(() => {
      onResync(id);
      setSyncing((prev) => prev.filter((x) => x !== id));
    }, 1100);
  };

  return (
    <>
      <div className="page__intro page__intro--row">
        <div>
          <p>The documents the assistant is allowed to answer from. Anything not listed here, it won't answer.</p>
        </div>
        <button className="btn btn--primary" onClick={onAddSource}><Icon name="upload" />Add source</button>
      </div>

      <Stats
        items={[
          { n: sources.length, label: 'Indexed sources' },
          { n: totalChunks, label: 'Searchable passages' },
          { n: reviewDue, label: `Need review (>${REVIEW_AFTER_DAYS} days)`, tone: reviewDue ? 'warn' : '' },
        ]}
        feedback={feedback}
      />

      <div className="table-card">
        <table className="sources-table">
          <thead>
            <tr>
              <th scope="col">Source</th><th scope="col">Type</th><th scope="col">Owner</th><th scope="col">Last updated</th>
              <th scope="col" className="num">Passages</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <button className="table-link" onClick={() => onOpenSource(s.id)}>
                    <SourceTypeIcon type={s.type} />
                    <span><strong>{s.title}</strong><small>{s.origin}</small></span>
                  </button>
                </td>
                <td data-label="Type">{s.type}</td>
                <td data-label="Owner">{s.owner}</td>
                <td data-label="Updated">{fmtDate(s.updated)}</td>
                <td data-label="Passages" className="num">{s.chunks}</td>
                <td data-label="Status">
                  {isStale(s.updated)
                    ? <span className="status status--warn">Review due</span>
                    : <span className="status status--ok">Indexed</span>}
                </td>
                <td>
                  <button
                    className={`icon-btn ${syncing.includes(s.id) ? 'is-spinning' : ''}`}
                    disabled={syncing.includes(s.id)}
                    aria-label={`Re-sync ${s.title}`}
                    title="Re-sync"
                    onClick={() => resync(s.id)}
                  >
                    <Icon name="refresh" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- shared

function Stats({ items, feedback }) {
  const flagged = feedback.filter(needsReview).length;
  const surveys = feedback.filter((f) => f.kind === 'survey');
  const avgRating = surveys.length ? (surveys.reduce((n, f) => n + f.rating, 0) / surveys.length).toFixed(1) : '–';
  return (
    <div className="stats">
      {items.map((s) => <Stat key={s.label} {...s} />)}
      <Stat n={flagged} label="Flagged by staff" tone={flagged ? 'alert' : ''} />
      <Stat n={avgRating} label={`Avg. rating (${surveys.length} survey${surveys.length === 1 ? '' : 's'})`} />
    </div>
  );
}

function FeedbackQueue({ feedback }) {
  return (
    <>
      <h2 className="section-title">Staff feedback queue</h2>
      {feedback.length ? (
        <ul className="feedback-list">
          {feedback.map((f) => (
            <li key={f.id} className="feedback">
              <FeedbackTag item={f} />
              <div className="feedback__body">
                {f.kind === 'survey' ? (
                  <strong>{f.rating}/5 · {RATINGS[f.rating - 1]}{f.category ? ` · ${f.category}` : ''}</strong>
                ) : (
                  <strong>“{f.question}”</strong>
                )}
                {(f.note || f.comment) && <p>{f.note || f.comment}</p>}
                <small>{f.by} · {fmtTime(f.at)}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty empty--small">
          <Icon name="flag" />
          <p>
            No feedback yet. Use <strong>Flag</strong> on an answer, <strong>Share feedback</strong> in the sidebar, or{' '}
            <strong>Log as content gap</strong> when the assistant can't answer.
          </p>
        </div>
      )}
    </>
  );
}

function FeedbackTag({ item }) {
  if (item.kind === 'survey') return <span className="status status--ok">Survey</span>;
  if (item.kind === 'gap') return <span className="status status--info">Content gap</span>;
  if (item.kind === 'vote') {
    return item.helpful
      ? <span className="status status--ok">Helpful</span>
      : <span className="status status--alert">Not helpful</span>;
  }
  return <span className="status status--alert">{item.reason}</span>;
}

function Stat({ n, label, tone = '', small = false }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''} ${small ? 'stat--small' : ''}`}>
      <span className="stat__n">{n}</span>
      <span className="stat__l">{label}</span>
    </div>
  );
}
