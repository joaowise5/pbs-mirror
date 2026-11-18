import { useEffect, useRef } from 'react';
import { Icon } from './Icons.jsx';
import { ASSISTANT_MODE } from '../services/assistant.js';
import { GROUP_LABELS, VIEWS } from '../lib/views.js';

export default function Sidebar({
  view, open, hidden = false, inert = false, conversations, activeId, feedbackCount,
  onNavigate, onNewChat, onOpenConversation, onFeedback,
}) {
  const firstRef = useRef(null);

  // Off-canvas (small screens): move focus into the panel when it opens.
  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open]);

  const resources = Object.entries(VIEWS)
    .filter(([, v]) => v.group === 'resources' && !(v.mockOnly && ASSISTANT_MODE === 'api'));

  return (
    <aside
      id="sidebar"
      className={`sidebar ${open ? 'is-open' : ''}`}
      aria-label="Workspace"
      aria-hidden={hidden || undefined}
      {...(inert ? { inert: '' } : {})}
    >
      <div className="sidebar__workspace">
        <p className="sidebar__label sidebar__label--accent">Workspace</p>
        <h2>Audience Services</h2>
        <p>Sourced answers for viewer questions.</p>
      </div>

      <button ref={firstRef} className="btn btn--light btn--block" onClick={onNewChat}>
        <Icon name="plus" />New conversation
      </button>

      <div className="sidebar__scroll">
        <p className="sidebar__label">Recent conversations</p>
        <ul className="recent">
          {conversations.length === 0 && (
            <li className="recent__empty">Your conversations from this session appear here.</li>
          )}
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                className="recent__item"
                aria-current={view === 'assistant' && c.id === activeId ? 'true' : undefined}
                onClick={() => onOpenConversation(c.id)}
              >
                <Icon name="chat" /><span>{c.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="sidebar__label">{GROUP_LABELS.resources}</p>
        <nav className="nav" aria-label={GROUP_LABELS.resources}>
          {resources.map(([key, v]) => (
            <button
              key={key}
              className="nav__item"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => onNavigate(key)}
            >
              <Icon name={v.icon} />
              <span>{v.label}</span>
              {key === 'sources' && feedbackCount > 0 && <span className="nav__count">{feedbackCount}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar__foot">
        <button className="nav__item" aria-current={view === 'feedback' ? 'page' : undefined} onClick={onFeedback}>
          <Icon name="message" /><span>Share feedback</span>
        </button>
        <div className="help-card">
          <Icon name="help" />
          <div>
            <strong>Need human help?</strong>
            <p>Contact your team lead for urgent or sensitive cases.</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
