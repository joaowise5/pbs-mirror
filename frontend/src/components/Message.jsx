import { useEffect, useId, useRef, useState } from 'react';
import { fmtDate, fmtTime } from '../lib/format.js';
import { ASSISTANT_MODE } from '../services/assistant.js';
import { Icon, LogoMark, SourceTypeIcon } from './Icons.jsx';

const FLAG_REASONS = ['Incorrect', 'Incomplete', 'Outdated', 'Wrong source'];

export default function Message({ message: m, onSend, onGoTo, actions }) {
  if (m.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="msg__bubble"><span className="sr-only">You asked: </span>{m.text}</div>
        <span className="msg__time"><span className="sr-only">Sent </span>{fmtTime(m.at)}</span>
      </div>
    );
  }

  let body;
  if (m.pending) {
    body = (
      <div className="pending">
        <span className="pending__dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{m.pending}</span>
      </div>
    );
  } else if (m.response.status === 'answered') {
    body = <AnswerCard m={m} onSend={onSend} actions={actions} />;
  } else if (m.response.status === 'chat') {
    body = (
      <div className="answer answer--chat">
        <p className="answer__summary">{m.response.message}</p>
      </div>
    );
  } else if (m.response.status === 'no_answer') {
    body = <NoAnswerCard m={m} onSend={onSend} onGoTo={onGoTo} actions={actions} />;
  } else {
    body = (
      <div className="answer answer--fail">
        <p>{m.response.message || 'Something went wrong reaching the assistant. Try again in a moment.'}</p>
      </div>
    );
  }

  return (
    <div className="msg msg--bot">
      <div className="msg__avatar" aria-hidden="true"><LogoMark /></div>
      <div className="msg__content"><span className="sr-only">Assistant: </span>{body}</div>
    </div>
  );
}

function AnswerCard({ m, onSend, actions }) {
  const r = m.response;
  const flagButtonRef = useRef(null);
  const general = r.tier === 'general';
  const high = r.confidence === 'high';
  const showingScript = m.displayFormat === 'phone_script' && Boolean(m.phoneScript);
  const badge = general
    ? { tone: 'info', icon: 'info', label: 'General troubleshooting · not from PBS sources' }
    : high
      ? { tone: 'ok', icon: 'shield', label: 'Verified answer' }
      : { tone: 'warn', icon: 'alert', label: 'Partial match · verify before sharing' };

  return (
    <>
      <article className="answer">
        <header className="answer__meta">
          <span className={`badge badge--${badge.tone}`}>
            <Icon name={badge.icon} />
            {badge.label}
          </span>
          <span className="answer__cat">{r.category}</span>
          {r.score != null && (
            <span className="answer__score" title="How closely the retrieved passages match the question">
              Match {Math.round(r.score * 100)}%
            </span>
          )}
        </header>

        {showingScript ? (
          <p className="answer__phone-script">
            {m.phoneScript}{' '}
            <span className="cite-marks">
              {r.citations.map((c, i) => (
                <button key={c.sourceId} className="cite-mark" aria-label={`Source ${i + 1}: ${c.title}`} onClick={() => actions.openCitation(c)}>
                  {i + 1}
                </button>
              ))}
            </span>
          </p>
        ) : (
          <>
            <ul className="answer__points">
              <li>
                {r.summary}{' '}
                <span className="cite-marks">
                  {r.citations.map((c, i) => (
                    <button key={c.sourceId} className="cite-mark" aria-label={`Source ${i + 1}: ${c.title}`} onClick={() => actions.openCitation(c)}>
                      {i + 1}
                    </button>
                  ))}
                </span>
              </li>
              {r.steps.map((step, i) => <li key={`step-${i}`}>{step}</li>)}
              {r.details.map((detail, i) => <li key={`detail-${i}`}>{detail}</li>)}
            </ul>
            {r.note && (
              <p className="answer__note"><Icon name="info" /><span>{r.note}</span></p>
            )}
          </>
        )}

        {r.citations.length > 0 && (
          <div className="answer__sources">
            <p className="answer__label">Sources</p>
            {r.citations.map((c, i) => (
              <button key={c.sourceId} className="source-chip" onClick={() => actions.openCitation(c)}>
                <span className="source-chip__n">{i + 1}</span>
                <SourceTypeIcon type={c.type} />
                <span className="source-chip__title">{c.title}</span>
                <span className="source-chip__meta">
                  {'crawled' in c
                    ? `${c.owner} · ${c.updated ? fmtDate(c.updated) : `crawled ${fmtDate(c.crawled)}`}`
                    : `${c.type} · ${fmtDate(c.updated)}`}
                </span>
              </button>
            ))}
          </div>
        )}

        <footer className="answer__actions">
          <button
            className={`act ${showingScript ? 'is-on' : ''}`}
            onClick={() => actions.togglePhoneScript(m)}
            disabled={m.scriptLoading || actions.busy}
            aria-pressed={showingScript}
          >
            <Icon name="message" />
            {m.scriptLoading ? 'Preparing script…' : showingScript ? 'Key points' : 'Phone script'}
          </button>
          <button className="act" onClick={() => actions.copy(m)}><Icon name="copy" />Copy</button>
          <button className="act" onClick={() => actions.email(m)}><Icon name="reply" />Copy as email reply</button>
          <span className="answer__spacer" />
          <button
            className={`act act--icon ${m.vote === 'up' ? 'is-on' : ''}`}
            aria-label="Helpful"
            aria-pressed={m.vote === 'up'}
            onClick={() => actions.vote(m, 'up')}
          >
            <Icon name="thumbs-up" />
          </button>
          <button
            className={`act act--icon ${m.vote === 'down' ? 'is-on' : ''}`}
            aria-label="Not helpful"
            aria-pressed={m.vote === 'down'}
            onClick={() => actions.vote(m, 'down')}
          >
            <Icon name="thumbs-down" />
          </button>
          <button
            ref={flagButtonRef}
            className={`act ${m.flagged ? 'is-flagged' : ''}`}
            disabled={m.flagged}
            aria-expanded={m.flagged ? undefined : Boolean(m.flagOpen)}
            onClick={() => actions.openFlag(m, true)}
          >
            <Icon name="flag" />{m.flagged ? 'Flagged' : 'Flag'}
          </button>
        </footer>

        {m.scriptError && <p className="answer__script-error" role="alert">{m.scriptError}</p>}

        {m.flagOpen && !m.flagged && (
          <FlagForm
            onCancel={() => { actions.openFlag(m, false); flagButtonRef.current?.focus(); }}
            onSubmit={(reason, note) => actions.submitFlag(m, reason, note)}
          />
        )}
      </article>

      {r.related.length > 0 && (
        <div className="related">
          <span>Related:</span>
          {r.related.map((x) => (
            <button key={x.id} className="chip" onClick={() => onSend(x.question)}>{x.question}</button>
          ))}
        </div>
      )}
    </>
  );
}

function FlagForm({ onCancel, onSubmit }) {
  const [reason, setReason] = useState(FLAG_REASONS[0]);
  const [note, setNote] = useState('');
  const name = useId(); // radio group name, unique per open form
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  return (
    <form className="flag-form" onSubmit={(e) => { e.preventDefault(); onSubmit(reason, note.trim()); }}>
      <fieldset>
        <legend className="flag-form__title">What's wrong with this answer?</legend>
        <div className="flag-form__reasons">
          {FLAG_REASONS.map((r, i) => (
            <label key={r} className="radio-chip">
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name={name}
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        rows={2}
        value={note}
        aria-label="Suggested correction (optional)"
        placeholder="Optional: what should it say instead?"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flag-form__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary btn--sm">Send to content review</button>
      </div>
    </form>
  );
}

function NoAnswerCard({ m, onSend, onGoTo, actions }) {
  const r = m.response;
  return (
    <article className="answer answer--fail">
      <header className="answer__meta">
        <span className="badge badge--fail"><Icon name="alert" />No verified answer</span>
      </header>
      <p className="answer__summary">I couldn't find this in the indexed PBS help sources, so I won't guess.</p>

      <p className="answer__label">What you can do</p>
      <ul className="answer__details">
        <li>
          {ASSISTANT_MODE === 'api' ? (
            <>Browse the <button className="inline-link" onClick={() => onGoTo('sources')}>Knowledge sources</button></>
          ) : (
            <>Search the <button className="inline-link" onClick={() => onGoTo('faq')}>Team FAQ</button></>
          )}{' '}
          or rephrase with the device, product, or error message the viewer mentioned.
        </li>
        <li>Escalate to your Audience Services lead, or route billing/refund questions to Membership.</li>
        <li>Log this question so the content team can add a source for it.</li>
      </ul>

      {r.closest.length > 0 && (
        <>
          <p className="answer__label">Closest topics I do have</p>
          <div className="related related--inline">
            {r.closest.map((x) => (
              <button key={x.id} className="chip" onClick={() => onSend(x.question)}>{x.question}</button>
            ))}
          </div>
        </>
      )}

      <footer className="answer__actions">
        <button className={`act ${m.gapLogged ? 'is-flagged' : ''}`} disabled={m.gapLogged} onClick={() => actions.logGap(m)}>
          <Icon name={m.gapLogged ? 'check' : 'flag'} />
          {m.gapLogged ? 'Logged as content gap' : 'Log as content gap'}
        </button>
      </footer>
    </article>
  );
}
