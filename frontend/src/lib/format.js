export const REVIEW_AFTER_DAYS = 60;

export const uid = () => Math.random().toString(36).slice(2, 10);

export function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000);
}

export function isStale(iso) {
  return Boolean(iso) && daysSince(iso) > REVIEW_AFTER_DAYS;
}

export function fmtDate(iso) {
  if (!iso) return 'date unknown';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** Plain-text version of an answer, for pasting into notes or chat. */
export function plainAnswer(r, phoneScript = '') {
  const parts = [phoneScript || r.summary];
  if (!phoneScript && r.steps.length) parts.push(r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  if (!phoneScript && r.details.length) parts.push(r.details.map((s) => `• ${s}`).join('\n'));
  if (!phoneScript && r.note) parts.push(`Note: ${r.note}`);
  if (r.citations.length) parts.push('Sources: ' + r.citations.map((c, i) => `[${i + 1}] ${c.title}${c.url ? ` (${c.url})` : ''}`).join('; '));
  else parts.push('General troubleshooting, not from PBS sources.');
  return parts.join('\n\n');
}

/** Viewer-facing email draft built from an answer. */
export function emailReply(r, user) {
  const lines = ['Hi there,', '', 'Thanks for reaching out to PBS Wisconsin.', '', r.summary];
  if (r.steps.length) lines.push('', ...r.steps.map((s, i) => `${i + 1}. ${s}`));
  if (r.details.length) lines.push('', ...r.details.map((s) => `• ${s}`));
  lines.push('', 'If anything still isn’t working, just reply to this email and we’ll help.', '', 'Best,', user.name, 'PBS Wisconsin Audience Services');
  return lines.join('\n');
}

/** Feedback that needs someone to look at it: flags, content gaps, and "not helpful" votes. */
export const needsReview = (f) => f.kind === 'flag' || f.kind === 'gap' || (f.kind === 'vote' && !f.helpful);
