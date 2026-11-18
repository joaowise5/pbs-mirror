/*
- Backend assistant service (FastAPI, see backend/app.py). Used when VITE_ASSISTANT_MODE=api.
- Same-origin by default: the Vite dev server proxies /api and /health to the backend.
 */
import { getAuthToken } from './auth.js';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const MESSAGES = {
  401: 'Your session expired. Please sign in again.',
  503: 'The assistant isn’t connected right now.',
  default: 'Something went wrong reaching the assistant. Try again in a moment.',
};

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(MESSAGES.default);
  }
  if (!res.ok) {
    if (res.status === 400) {
      const error = await res.json().catch(() => null);
      throw new Error(error?.message || error?.detail || MESSAGES.default);
    }
    throw new Error(MESSAGES[res.status] || MESSAGES.default);
  }
  return res.json();
}

export const apiAssistant = {
  async health() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const data = await request('/health', { signal: controller.signal });
      return { ok: data.status === 'ok' && data.mode === 'live' };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Ask either inside a persisted conversation (if conversationId is provided)
   * or fall back to the stateless /api/ask endpoint.
   */
  async ask(question, { onStatus = () => {}, history = [], format = 'bullets', answerId, conversationId } = {}) {
    onStatus(format === 'phone_script' ? 'Preparing a phone script…' : 'Searching the PBS help pages…');
    const endpoint = conversationId
      ? `/api/conversations/${conversationId}/messages`
      : '/api/ask';

    return request(endpoint, {
      method: 'POST',
      body: {
        question,
        history,
        format,
        ...(answerId ? { answerId } : {}),
      },
    });
  },
};

export const conversationsApi = {
  list: () => request('/api/conversations'),
  create: (title = 'New Chat') => request('/api/conversations', { method: 'POST', body: { title } }),
  messages: (conversationId) => request(`/api/conversations/${conversationId}/messages`),
};

/** The crawled PBS help pages the backend answers from: { lastCrawled, sources: [...] }. */
export const sourcesApi = {
  list: () => request('/api/sources'),
};

export const feedbackApi = {
  add: (item) => request('/api/feedback', { method: 'POST', body: item }),
  list: () => request('/api/feedback'),
};