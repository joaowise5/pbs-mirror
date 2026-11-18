import { useMemo, useState } from 'react';
import { KB } from '../data/knowledgeBase.js';
import { Icon, SourceTypeIcon } from './Icons.jsx';

const sourceById = Object.fromEntries(KB.sources.map((s) => [s.id, s]));

export default function FaqView({ onAsk, onOpenSource }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const items = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return KB.entries.filter((e) => {
      if (category !== 'All' && e.category !== category) return false;
      const hay = [e.question, e.summary, ...(e.steps || []), ...(e.details || []), ...e.keywords].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query, category]);

  return (
    <section className="view">
      <div className="page">
        <div className="page__intro">
          <p>The most common viewer questions, reviewed by Audience Services. Every entry links to the source it came from.</p>
        </div>

        <div className="faq-toolbar">
          <label className="search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              placeholder="Search FAQs: Roku, activation, livestream…"
              aria-label="Search FAQs"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="chips" role="group" aria-label="Filter by category">
            {['All', ...KB.categories].map((c) => (
              <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
        </div>

        <p className="sr-only" role="status">{items.length} {items.length === 1 ? 'question' : 'questions'} shown</p>

        <div className="faq-list">
          {items.map((e) => (
            <details key={e.id} className="faq-item">
              <summary>
                <span className="faq-item__cat">{e.category}</span>
                <span className="faq-item__q">{e.question}</span>
                <Icon name="chevron" className="faq-item__chev" />
              </summary>
              <div className="faq-item__body">
                <p>{e.summary}</p>
                {e.steps && <ol>{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
                {e.details && <ul>{e.details.map((s) => <li key={s}>{s}</li>)}</ul>}
                {e.note && <p className="answer__note"><Icon name="info" /><span>{e.note}</span></p>}
                <div className="faq-item__foot">
                  <div className="faq-item__sources">
                    {e.citations.map((c) => (
                      <button key={c.sourceId} className="mini-source" onClick={() => onOpenSource(c.sourceId, c.excerpt)}>
                        <SourceTypeIcon type={sourceById[c.sourceId].type} />
                        {sourceById[c.sourceId].title}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={() => onAsk(e.question)}>
                    <Icon name="chat" />Ask the assistant
                  </button>
                </div>
              </div>
            </details>
          ))}

          {items.length === 0 && (
            <div className="empty">
              <Icon name="search" />
              <p><strong>No FAQs match “{query}”.</strong></p>
              <p>Try the assistant instead. It searches every indexed source.</p>
              <button className="btn btn--primary btn--sm" onClick={() => onAsk(query)}>Ask the assistant</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
