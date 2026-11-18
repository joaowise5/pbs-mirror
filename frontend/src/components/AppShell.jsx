import { useCallback, useEffect, useRef, useState } from 'react';
import { KB } from '../data/knowledgeBase.js';
import { ASSISTANT_MODE, assistant } from '../services/assistant.js';
import { conversationsApi, feedbackApi, sourcesApi } from '../services/assistant.api.js';
import { copyText, emailReply, needsReview, plainAnswer, truncate, uid } from '../lib/format.js';
import { GROUP_LABELS, VIEWS } from '../lib/views.js';
import { Icon } from './Icons.jsx';
import AppHeader from './AppHeader.jsx';
import Sidebar from './Sidebar.jsx';
import AssistantView from './AssistantView.jsx';
import FaqView from './FaqView.jsx';
import SourcesView from './SourcesView.jsx';
import SourceDrawer from './SourceDrawer.jsx';
import PlaceholderView from './PlaceholderView.jsx';
import FeedbackView from './FeedbackView.jsx';

function useToast() {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');
  const [visible, setVisible] = useState(false);
  const timer = useRef();
  // Errors use role="alert" so screen readers announce them immediately (WCAG 4.1.3).
  const show = useCallback((msg, { tone: nextTone = 'info' } = {}) => {
    setMessage(msg);
    setTone(nextTone);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, visible, show, tone];
}

const SMALL_SCREEN = '(max-width: 900px)';

// True while the sidebar is an off-canvas panel (it is always visible on wider screens).
function useSmallScreen() {
  const [small, setSmall] = useState(() => window.matchMedia(SMALL_SCREEN).matches);
  useEffect(() => {
    const media = window.matchMedia(SMALL_SCREEN);
    const onChange = () => setSmall(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return small;
}

const APP_TITLE = 'PBS Wisconsin Help Assistant';

const HISTORY_TURNS = 6;

// Earlier turns of a conversation, so the backend can understand follow-up questions.
function historyOf(convo) {
  if (!convo) return [];
  return convo.messages
    .map((m) => {
      if (m.role === 'user') return { role: 'user', text: m.text };
      if (m.response?.status === 'answered') return { role: 'assistant', text: m.response.summary };
      if (m.response?.status === 'chat') return { role: 'assistant', text: m.response.message };
      return null;
    })
    .filter(Boolean)
    .slice(-HISTORY_TURNS);
}

const withDate = (item) => ({ ...item, at: new Date(item.at) });

function mapBackendMessages(rows) {
  let lastQuestion = '';
  return rows.map((row) => {
    const at = new Date(row.created_at || Date.now());
    if (row.role === 'user') {
      lastQuestion = row.content;
      return { id: String(row.id), role: 'user', text: row.content, at };
    }
    let response = null;
    if (row.payload) {
      try {
        response = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      } catch {
        response = { status: 'chat', message: row.content };
      }
    } else {
      response = { status: 'chat', message: row.content };
    }
    return {
      id: String(row.id),
      role: 'assistant',
      question: lastQuestion,
      response,
      at,
    };
  });
}

export default function AppShell({ user, backendStatus, onSignOut, themePreference, onThemeChange }) {
  const [view, setView] = useState('assistant');
  const [returnTo, setReturnTo] = useState('assistant'); // where "Back to chat" goes from the feedback page
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null); // null = fresh conversation (welcome screen)
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState([]); // { id, kind: 'flag' | 'gap' | 'vote' | 'survey', question, ..., by, at }
  const [sources, setSources] = useState(KB.sources); // mock mode only
  // api mode: the crawled PBS help pages the backend answers from (GET /api/sources).
  const [crawl, setCrawl] = useState({ status: 'loading', sources: [], lastCrawled: null });
  const [drawer, setDrawer] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMessage, toastVisible, toast, toastTone] = useToast();
  const smallScreen = useSmallScreen();
  const menuButtonRef = useRef(null);
  const headingRef = useRef(null);
  const drawerOpenerRef = useRef(null); // element to refocus when the source drawer closes
  const firstRender = useRef(true);

  const activeConvo = conversations.find((c) => c.id === activeId) || null;
  const errorToast = (msg) => toast(msg, { tone: 'error' });

  const closeSidebar = useCallback(() => {
    if (!sidebarOpen) return;
    setSidebarOpen(false);
    menuButtonRef.current?.focus();
  }, [sidebarOpen]);

  const openDrawer = (details) => {
    if (!drawerOpenerRef.current) drawerOpenerRef.current = document.activeElement;
    setDrawer(details);
  };

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    const opener = drawerOpenerRef.current;
    drawerOpenerRef.current = null;
    if (opener && document.contains(opener)) opener.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeSidebar();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeDrawer, closeSidebar]);

  // Each view gets its own document title (WCAG 2.4.2), and moving between views puts focus on the
  // new page heading so keyboard and screen-reader users land at the top of the content (2.4.3).
  useEffect(() => {
    document.title = `${VIEWS[view].label} · ${APP_TITLE}`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (view !== 'assistant') headingRef.current?.focus();
  }, [view]);

  const goTo = (next) => {
    setView(next);
    setSidebarOpen(false);
  };

  const updateMessage = useCallback((convoId, msgId, patch) => {
    setConversations((prev) => prev.map((c) => (c.id !== convoId ? c : {
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
    })));
  }, []);

const send = async (raw) => {
    const text = raw.trim();
    if (!text || busy) return;
    goTo('assistant');

    setBusy(true);
    let convoId = activeConvo ? activeConvo.id : null;

    if (!convoId) {
      if (ASSISTANT_MODE === 'api') {
        try {
          const created = await conversationsApi.create(truncate(text, 44));
          convoId = created.id;
        } catch (err) {
          toast('Could not create a new conversation.');
          setBusy(false);
          return;
        }
      } else {
        convoId = uid();
      }
    }

    const userMsg = { id: uid(), role: 'user', text, at: new Date() };
    const botMsg = { id: uid(), role: 'assistant', question: text, pending: 'Searching…', at: new Date() };

    setConversations((prev) => (activeConvo
      ? prev.map((c) => (c.id === convoId ? { ...c, messages: [...c.messages, userMsg, botMsg] } : c))
      : [{ id: convoId, title: truncate(text, 44), loaded: true, messages: [userMsg, botMsg] }, ...prev]));
    setActiveId(convoId);

    let response;
    try {
      response = await assistant.ask(text, {
        onStatus: (s) => updateMessage(convoId, botMsg.id, { pending: s }),
        history: historyOf(activeConvo),
        conversationId: ASSISTANT_MODE === 'api' ? convoId : undefined,
      });
    } catch (err) {
      response = { status: 'error', message: err.message };
    }
    updateMessage(convoId, botMsg.id, { pending: null, response, at: new Date() });
    setBusy(false);
  };

// In api mode feedback and conversations are stored by the backend; in mock mode they live only in this session.
  useEffect(() => {
    if (ASSISTANT_MODE !== 'api') return;
    conversationsApi.list()
      .then((list) => {
        setConversations(list.map((c) => ({
          id: c.id,
          title: c.title,
          loaded: false,
          messages: [],
        })));
      })
      .catch(() => {});
    feedbackApi.list().then((items) => setFeedback(items.map(withDate))).catch(() => {});
    sourcesApi.list()
      .then((data) => setCrawl({ status: 'ready', sources: data.sources, lastCrawled: data.lastCrawled }))
      .catch(() => setCrawl((prev) => ({ ...prev, status: 'error' })));
  }, [user.id]);

  const addFeedback = async (item) => {
    let saved = { id: uid(), by: user.name, at: new Date(), ...item };
    if (ASSISTANT_MODE === 'api') saved = withDate(await feedbackApi.add({ by: user.name, ...item }));
    setFeedback((prev) => [saved, ...prev]);
  };

  const messageActions = {
    busy,
    copy: (m) => copyText(plainAnswer(m.response, m.displayFormat === 'phone_script' ? m.phoneScript : '')).then(() => toast('Answer copied with sources')),
    togglePhoneScript: async (m) => {
      if (busy) return;
      if (m.displayFormat === 'phone_script') {
        updateMessage(activeId, m.id, { displayFormat: 'bullets' });
        return;
      }
      if (m.phoneScript) {
        updateMessage(activeId, m.id, { displayFormat: 'phone_script' });
        return;
      }
      if (!m.response?.answerId) {
        updateMessage(activeId, m.id, { scriptError: 'This answer has no script reference. Ask the question again.' });
        return;
      }
      setBusy(true);
      updateMessage(activeId, m.id, { scriptLoading: true, scriptError: '' });
      try {
        const scriptResult = await assistant.ask(m.question, {
          format: 'phone_script', answerId: m.response.answerId,
        });
        updateMessage(activeId, m.id, {
          phoneScript: scriptResult.phoneScript,
          displayFormat: 'phone_script',
          scriptLoading: false,
        });
      } catch (err) {
        updateMessage(activeId, m.id, { scriptLoading: false, scriptError: err.message });
      } finally {
        setBusy(false);
      }
    },
    email: (m) => copyText(emailReply(m.response, user)).then(() => toast('Email reply copied. Paste it into your response.')),
    vote: async (m, vote) => {
      const next = m.vote === vote ? null : vote;
      updateMessage(activeId, m.id, { vote: next, flagOpen: next === 'down' && !m.flagged ? true : m.flagOpen });
      if (!next) return;
      try {
        await addFeedback({ kind: 'vote', helpful: next === 'up', question: m.question, answer: plainAnswer(m.response) });
      } catch {
        errorToast('Couldn’t save your vote. Try again.');
        return;
      }
      if (next === 'up') toast('Thanks! Marked as helpful.');
    },
    openFlag: (m, open) => updateMessage(activeId, m.id, { flagOpen: open }),
    submitFlag: async (m, reason, note) => {
      try {
        await addFeedback({ kind: 'flag', question: m.question, reason, note });
      } catch {
        errorToast('Couldn’t send the flag. Try again.');
        return;
      }
      updateMessage(activeId, m.id, { flagged: true, flagOpen: false });
      toast('Flagged for content review. Thank you!');
    },
    logGap: async (m) => {
      try {
        await addFeedback({ kind: 'gap', question: m.question });
      } catch {
        errorToast('Couldn’t log the content gap. Try again.');
        return;
      }
      updateMessage(activeId, m.id, { gapLogged: true });
      toast('Logged. The content team will see it in the feedback queue.');
    },
    openCitation: (c) => openDrawer({ ...c, id: c.sourceId }),
  };

  // Mock mode: a source from the sample knowledge base.
  const openSource = (sourceId, excerpt = '') => {
    const s = sources.find((x) => x.id === sourceId);
    openDrawer({ ...s, excerpt });
  };

  // Api mode: a crawled page from the Knowledge sources list, in the drawer's citation shape (no passage).
  const openPage = (pageId) => {
    const p = crawl.sources.find((x) => x.id === pageId);
    if (!p) return;
    openDrawer({
      id: p.id, title: p.title, type: 'Web', origin: p.site, url: p.url, owner: p.owner,
      updated: p.updated, crawled: p.crawled, chunks: p.passages, audience: p.audience,
      topic: p.breadcrumb.join(' › '), excerpt: '',
    });
  };

  const resync = (sourceId) => {
    const today = new Date().toISOString().slice(0, 10);
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, updated: today } : s)));
    toast(`Re-synced “${sources.find((s) => s.id === sourceId).title}” (simulated)`);
  };

  const newChat = () => {
    if (busy) return;
    setActiveId(null);
    goTo('assistant');
  };

  const openFeedback = () => {
    if (view !== 'feedback') setReturnTo(view);
    goTo('feedback');
  };

  const submitSurvey = async ({ rating, category, comment }) => {
    try {
      await addFeedback({ kind: 'survey', rating, category, comment, conversationId: activeId });
    } catch (err) {
      errorToast('Couldn’t send feedback. Try again.');
      throw err;
    }
  };

 const openConversation = async (id) => {
    if (busy) return;
    setActiveId(id);
    goTo('assistant');

    const target = conversations.find((c) => c.id === id);
    if (ASSISTANT_MODE === 'api' && target && !target.loaded) {
      try {
        const rows = await conversationsApi.messages(id);
        const mapped = mapBackendMessages(rows);
        setConversations((prev) => prev.map((c) => (
          c.id === id ? { ...c, messages: mapped, loaded: true } : c
        )));
      } catch {
        toast('Could not load conversation history.');
      }
    }
  };

  const current = VIEWS[view];
  const sidebarHidden = smallScreen && !sidebarOpen;
  // While the drawer (a modal dialog) is open, everything behind it is inert.
  const behindDrawer = drawer ? { inert: '' } : {};

  return (
    <div className="app">
      <a className="skip-link" href="#main" {...behindDrawer}>Skip to main content</a>
      <AppHeader
        menuButtonRef={menuButtonRef}
        menuOpen={sidebarOpen}
        inertProps={behindDrawer}
        user={user}
        themePreference={themePreference}
        onThemeChange={onThemeChange}
        backendStatus={backendStatus}
        showSampleBadge={ASSISTANT_MODE === 'mock'}
        onMenu={() => setSidebarOpen(true)}
        onSignOut={onSignOut}
      />
      <Sidebar
        view={view}
        open={sidebarOpen}
        conversations={conversations.filter((c) => c.messages.length || !c.loaded)}
        hidden={sidebarHidden}
        inert={Boolean(drawer) || sidebarHidden}
        activeId={activeId}
        feedbackCount={feedback.filter(needsReview).length}
        onNavigate={goTo}
        onNewChat={newChat}
        onOpenConversation={openConversation}
        onFeedback={openFeedback}
      />
      <div
        className={`scrim ${sidebarOpen || drawer ? 'is-visible' : ''}`}
        aria-hidden="true"
        onClick={() => { if (drawer) closeDrawer(); closeSidebar(); }}
      />

      <main className="main" id="main" tabIndex={-1} {...(drawer || (smallScreen && sidebarOpen) ? { inert: '' } : {})}>
        <header className="titlebar">
          <div className="titlebar__text">
            {view === 'assistant' ? (
              <>
                <p className="eyebrow"><Icon name="sparkle" />AI knowledge assistant</p>
                <h1 className="titlebar__title" ref={headingRef} tabIndex={-1}>How can I help today?</h1>
              </>
            ) : (
              <>
                <p className="eyebrow">{current.eyebrow || GROUP_LABELS[current.group]}</p>
                <h1 className="titlebar__title" ref={headingRef} tabIndex={-1}>{current.label}</h1>
              </>
            )}
          </div>
          {view === 'assistant' && (
            <button className="btn btn--ghost btn--sm titlebar__action" onClick={openFeedback}>
              <Icon name="message" /><span>Share feedback</span>
            </button>
          )}
        </header>

        {view === 'assistant' && (
          <AssistantView
            key={activeId || 'new'}
            user={user}
            conversation={activeConvo}
            busy={busy}
            sourceCount={ASSISTANT_MODE === 'api' ? (crawl.status === 'ready' ? crawl.sources.length : null) : sources.length}
            onSend={send}
            onGoTo={goTo}
            actions={messageActions}
          />
        )}
        {view === 'faq' && ASSISTANT_MODE === 'mock' && <FaqView onAsk={send} onOpenSource={openSource} />}
        {view === 'sources' && (
          <SourcesView
            crawl={ASSISTANT_MODE === 'api' ? crawl : null}
            sources={sources}
            feedback={feedback}
            onOpenSource={openSource}
            onOpenPage={openPage}
            onResync={resync}
            onAddSource={() => toast('Source ingestion isn’t connected yet.')}
          />
        )}
        {view === 'feedback' && (
          <FeedbackView
            user={user}
            onBack={() => goTo(returnTo)}
            onDone={() => { if (!busy) setActiveId(null); goTo('assistant'); }}
            onSubmit={submitSurvey}
          />
        )}
        {(view === 'handbook' || view === 'escalation') && (
          <PlaceholderView key={view} icon={current.icon} title={current.label} />
        )}
      </main>

      <SourceDrawer source={drawer} onClose={closeDrawer} />

      {/* Two persistent live regions, so the message lands in one that already exists in the DOM. */}
      <div className={`toast ${toastVisible && toastTone !== 'error' ? 'is-visible' : ''}`} role="status">
        {toastTone !== 'error' ? toastMessage : ''}
      </div>
      <div className={`toast toast--error ${toastVisible && toastTone === 'error' ? 'is-visible' : ''}`} role="alert">
        {toastTone === 'error' ? toastMessage : ''}
      </div>
    </div>
  );
}
