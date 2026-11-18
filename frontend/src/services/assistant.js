/*
 * Assistant service used by the UI. Pick the implementation with VITE_ASSISTANT_MODE:
 *   api (default) - the FastAPI backend (proxied by the Vite dev server, see vite.config.js)
 *   mock          - sample knowledge base in the browser, no backend needed
 *
 * Both expose the same interface: ask(question, { onStatus, history, format, answerId }) and health().
 */
import { mockAssistant } from './assistant.mock.js';
import { apiAssistant } from './assistant.api.js';

export const ASSISTANT_MODE = import.meta.env.VITE_ASSISTANT_MODE === 'mock' ? 'mock' : 'api';

export const assistant = ASSISTANT_MODE === 'api' ? apiAssistant : mockAssistant;
