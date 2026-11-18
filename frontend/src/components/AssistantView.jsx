import { useEffect, useRef, useState } from 'react';
import { Icon, LogoMark } from './Icons.jsx';
import Message from './Message.jsx';

const QUICK_PROMPTS = [
  { title: 'Passport videos locked', caption: 'Activated but still can’t watch', q: 'Member activated Passport but videos are still locked' },
  { title: 'Set up Passport on Roku', caption: 'Device activation steps', q: 'How do I set up Passport on Roku?' },
  { title: 'Missing activation email', caption: 'Resend or find the email', q: 'A member never got their activation email' },
  { title: 'Show not on livestream', caption: 'Live TV availability', q: 'Why is a show not available on the livestream?' },
];

export default function AssistantView({ user, conversation, busy, sourceCount, onSend, onGoTo, actions }) {
  const [draft, setDraft] = useState('');
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const messages = conversation?.messages || [];
  const pending = messages.some((m) => m.pending);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [draft]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const submit = (e) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <section className="view view--assistant">
      {/* role="log": new messages are announced politely; aria-busy holds the announcement
          until the answer has replaced the "Searching…" placeholder. */}
      <div className="thread" ref={threadRef} role="log" aria-label="Conversation" aria-busy={pending}>
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="quick-grid">
              {QUICK_PROMPTS.map((p) => (
                <button key={p.q} className="quick-card" onClick={() => onSend(p.q)}>
                  <span>
                    <strong>{p.title}</strong>
                    <small>{p.caption}</small>
                  </span>
                  <Icon name="arrow-right" />
                </button>
              ))}
            </div>
            <div className="msg msg--bot">
              <div className="msg__avatar" aria-hidden="true"><LogoMark /></div>
              <div className="msg__content">
                <div className="greeting">
                  Hi {user.name.split(' ')[0]} — describe what the viewer is asking and I’ll find a sourced answer
                  you can read back or paste into a reply.
                </div>
                <p className="welcome__foot">
                  <Icon name="shield" />{' '}
                  {sourceCount == null ? 'Grounded in the PBS help pages' : `Grounded in ${sourceCount} indexed sources`}
                  {' '}· Cites every answer · Won’t guess
                </p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} onSend={onSend} onGoTo={onGoTo} actions={actions} />)
        )}
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={submit}>
          <Icon name="search" className="composer__icon" />
          <span id="composer-hint" className="sr-only">Enter to send, Shift plus Enter for a new line.</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder="Ask about a policy, process, or viewer issue…"
            aria-label="Ask the help assistant"
            aria-describedby="composer-hint"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
            }}
          />
          <button className="btn btn--primary composer__send" type="submit" aria-label="Send question" disabled={busy}>
            <Icon name="send" />
          </button>
        </form>
        <p className="composer__hint">
          <span>AI can make mistakes. Confirm sensitive policies before sharing with viewers.</span>
          <span className="composer__keys" aria-hidden="true">Enter to send · Shift + Enter for a new line</span>
        </p>
      </div>
    </section>
  );
}
