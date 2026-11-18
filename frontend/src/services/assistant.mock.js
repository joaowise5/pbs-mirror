/*
 * MOCK assistant service: a tiny keyword retriever over the sample knowledge base.
 * No LLM or API key is involved. Used when VITE_ASSISTANT_MODE=mock (the default).
 */
import { KB } from '../data/knowledgeBase.js';
import { uid } from '../lib/format.js';

const HIGH_CONFIDENCE = 0.6;
const MIN_CONFIDENCE = 0.4; // below this the assistant refuses rather than guessing

const STOP = new Set(('a an the is are was were be been am im i me my we our you your he she they them their it its this that these ' +
  'those to of in on at for with by from and or but if so do does did can could would should will how what why when where which who ' +
  'there here about into than then just also please hi hello hey get got has have had viewer caller customer say says said want wants ' +
  'need needs trying try us up').split(' '));

const SYNONYMS = {
  login: 'signin', logon: 'signin', log: 'signin', sign: 'signin', signin: 'signin',
  livestream: 'live', livestreaming: 'live',
  firestick: 'fire', television: 'tv',
  donate: 'gift', donation: 'gift', donor: 'gift', pledge: 'gift', contribution: 'gift',
  members: 'member', membership: 'member',
  renewal: 'renew', expiration: 'expire', expired: 'expire', expiring: 'expire',
  emails: 'email',
};

function stem(w) {
  if (w.length > 6 && w.endsWith('ation')) w = w.slice(0, -5) + 'at';
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map((w) => stem(SYNONYMS[w] || w));
}

// Build a weighted term index per entry once at load.
const index = KB.entries.map((entry) => {
  const weights = new Map();
  const add = (text, weight) => tokenize(text).forEach((t) => weights.set(t, Math.max(weights.get(t) || 0, weight)));
  const phrases = [];

  entry.keywords.forEach((k) => {
    const toks = tokenize(k);
    if (toks.length > 1) phrases.push(toks.join(' '));
    add(k, 3);
  });
  add(entry.question, 2);
  add([entry.summary, ...(entry.steps || []), ...(entry.details || []), entry.note || ''].join(' '), 1);

  return { entry, weights, phrases, questionKey: tokenize(entry.question).join(' ') };
});

function score(question) {
  const qTokens = [...new Set(tokenize(question))];
  const qKey = ` ${tokenize(question).join(' ')} `;
  if (!qTokens.length) return [];

  return index
    .map(({ entry, weights, phrases, questionKey }) => {
      if (qKey.trim() === questionKey) return { entry, score: 0.95, keywordHit: true };
      let hit = 0;
      let keywordHit = false;
      qTokens.forEach((t) => {
        const w = weights.get(t) || 0;
        hit += w;
        if (w >= 3) keywordHit = true;
      });
      const phraseHits = phrases.filter((p) => qKey.includes(` ${p} `)).length;
      if (phraseHits) keywordHit = true;
      const raw = (hit + phraseHits * 2) / (3 * Math.min(qTokens.length, 4));
      return { entry, score: Math.min(raw, 0.97), keywordHit };
    })
    .sort((a, b) => b.score - a.score);
}

const GREETING = /^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/i;
const THANKS = /^(thanks|thank you|thx|ty)\b/i;

// Greetings and thanks get a short reply instead of a "no verified answer" card.
function chatReply(question) {
  const q = question.trim();
  if (q.split(/\s+/).length > 6) return null;
  if (GREETING.test(q)) return 'Hi! Ask me about PBS Passport, streaming devices, live TV, or member accounts.';
  if (THANKS.test(q)) return 'You’re welcome! Anything else I can look up?';
  return null;
}

const sourceById = Object.fromEntries(KB.sources.map((s) => [s.id, s]));
const totalChunks = KB.sources.reduce((n, s) => n + s.chunks, 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const savedAnswers = new Map();

// In mock mode there is no Claude. The script is only a local demonstration.
function mockPhoneScript(r) {
  return [r.summary, ...r.steps, ...r.details, r.note]
    .filter(Boolean)
    .map((part) => /[.!?]$/.test(part.trim()) ? part.trim() : `${part.trim()}.`)
    .join(' ');
}

export const mockAssistant = {
  /** The mock has no backend to reach, so it is always available. */
  async health() {
    return { ok: true };
  },

  /**
   * @param {string} question
   * @param {{ onStatus?: (text: string) => void }} [opts]
   */
  async ask(question, { onStatus = () => {}, format = 'bullets', answerId } = {}) {
    const started = performance.now();
    if (format === 'phone_script') {
      const saved = savedAnswers.get(answerId);
      if (!saved || saved.question !== question) throw new Error('That answer is no longer available. Ask again.');
      onStatus('Preparing a sample phone script…');
      await wait(250);
      return { ...saved.response, format: 'phone_script', phoneScript: mockPhoneScript(saved.response),
        latencyMs: Math.round(performance.now() - started) };
    }
    const reply = chatReply(question);
    if (reply) {
      await wait(300);
      return { status: 'chat', message: reply, latencyMs: Math.round(performance.now() - started) };
    }
    onStatus(`Searching ${KB.sources.length} indexed sources…`);
    await wait(450);
    onStatus(`Ranking ${totalChunks} passages…`);
    await wait(400);

    const ranked = score(question);
    const top = ranked[0];
    const confident = top && top.keywordHit && top.score >= MIN_CONFIDENCE;

    if (!confident) {
      await wait(250);
      return {
        status: 'no_answer',
        score: top ? top.score : 0,
        closest: ranked.filter((r) => r.score >= 0.15).slice(0, 3).map((r) => ({ id: r.entry.id, question: r.entry.question })),
        latencyMs: Math.round(performance.now() - started),
      };
    }

    const { entry } = top;
    onStatus(`Drafting answer from ${entry.citations.length} cited passage${entry.citations.length > 1 ? 's' : ''}…`);
    await wait(450);

    const response = {
      status: 'answered',
      confidence: top.score >= HIGH_CONFIDENCE ? 'high' : 'medium',
      score: top.score,
      entryId: entry.id,
      category: entry.category,
      summary: entry.summary,
      steps: entry.steps || [],
      details: entry.details || [],
      note: entry.note || '',
      citations: entry.citations.map((c) => ({ ...sourceById[c.sourceId], ...c })),
      related: ranked.slice(1).filter((r) => r.score >= 0.25).slice(0, 2).map((r) => ({ id: r.entry.id, question: r.entry.question })),
      latencyMs: Math.round(performance.now() - started),
      answerId: uid(),
      format: 'bullets',
    };
    savedAnswers.set(response.answerId, { question, response });
    if (savedAnswers.size > 128) savedAnswers.delete(savedAnswers.keys().next().value);
    return response;
  },
};
