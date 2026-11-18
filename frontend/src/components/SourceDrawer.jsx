import { useEffect, useRef } from 'react';
import { fmtDate, isStale } from '../lib/format.js';
import { Icon, SourceTypeIcon } from './Icons.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

export default function SourceDrawer({ source, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (source) closeRef.current?.focus();
  }, [source]);

  // Modal dialog: keep Tab and Shift+Tab inside the drawer (WCAG 2.4.3).
  const trapFocus = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <aside
      ref={panelRef}
      className={`drawer ${source ? 'is-open' : ''}`}
      role={source ? 'dialog' : undefined}
      aria-modal={source ? 'true' : undefined}
      aria-labelledby={source ? 'drawer-title' : undefined}
      aria-hidden={!source || undefined}
      onKeyDown={trapFocus}
    >
      {source && (
        <>
          <header className="drawer__head">
            <p className="drawer__eyebrow"><SourceTypeIcon type={source.type} />{source.type} source · {source.id}</p>
            <button ref={closeRef} className="icon-btn" aria-label="Close source details" onClick={onClose}><Icon name="x" /></button>
          </header>
          <h2 className="drawer__title" id="drawer-title">{source.title}</h2>
          <dl className="drawer__meta">
            <div><dt>Location</dt><dd>{source.origin}</dd></div>
            <div><dt>Owner</dt><dd>{source.owner}</dd></div>
            {'crawled' in source ? (
              // A crawled PBS help page (api mode): the page's own date, if it shows one, and when it was crawled.
              <>
                <div><dt>Last updated</dt><dd>{fmtDate(source.updated)}</dd></div>
                <div><dt>Crawled</dt><dd>{fmtDate(source.crawled)}</dd></div>
                {source.section && <div><dt>Section</dt><dd>{source.section}</dd></div>}
                {source.topic && <div><dt>Topic</dt><dd>{source.topic}</dd></div>}
                {source.audience === 'station_staff' && (
                  <div><dt>Written for</dt><dd>Station staff</dd></div>
                )}
                {source.chunks != null && <div><dt>Passages</dt><dd>{source.chunks}</dd></div>}
              </>
            ) : (
              <>
                <div>
                  <dt>Last updated</dt>
                  <dd>{fmtDate(source.updated)} {isStale(source.updated) && <span className="status status--warn">Review due</span>}</dd>
                </div>
                <div><dt>Indexed chunks</dt><dd>{source.chunks}</dd></div>
              </>
            )}
          </dl>
          {source.excerpt && (
            <>
              <p className="drawer__label">Retrieved passage</p>
              <blockquote className="drawer__quote">{source.excerpt}</blockquote>
              <p className="drawer__hint">This is the exact passage the answer was built from.</p>
            </>
          )}
          {source.url ? (
            <a className="btn btn--ghost btn--block" href={source.url} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" />Open original page<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <>
              <button className="btn btn--ghost btn--block" disabled><Icon name="globe" />Open original document</button>
              <p className="drawer__hint">
                This is an internal document with no web link yet. Ask {source.owner} for the current copy.
              </p>
            </>
          )}
        </>
      )}
    </aside>
  );
}
