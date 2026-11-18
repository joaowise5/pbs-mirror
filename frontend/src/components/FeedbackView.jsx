import { useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

export const RATINGS = ['Not useful', 'Slightly', 'Helpful', 'Very helpful', 'Excellent'];
export const CATEGORIES = ['Answer accuracy', 'Ease of use', 'Response speed', 'Content coverage'];
const MAX_COMMENT = 1000;

export default function FeedbackView({ user, onBack, onDone, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState(false);
  const ratingRefs = useRef([]);

  const firstName = user.name.split(' ')[0];

  const pickRating = (value) => {
    setRating(value);
    setRatingError(false);
    ratingRefs.current[value - 1]?.focus();
  };

  // Radio-group keyboard pattern: arrows move and select.
  const onRatingKey = (e) => {
    const n = RATINGS.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      pickRating(rating ? (rating % n) + 1 : 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      pickRating(rating ? ((rating + n - 2) % n) + 1 : n);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    // The submit button stays enabled so keyboard and screen-reader users get told what's missing
    // (a disabled button with a tooltip is unreachable). WCAG 3.3.1.
    if (!rating) {
      setRatingError(true);
      ratingRefs.current[0]?.focus();
      return;
    }
    setSending(true);
    try {
      await onSubmit({ rating, category, comment: comment.trim() });
      setSubmitted(true);
    } catch {
      // onSubmit reports the failure; keep the form so nothing is lost.
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <section className="view view--feedback">
        <div className="feedback-card feedback-card--done">
          <span className="feedback-card__check" aria-hidden="true"><Icon name="check" /></span>
          <p className="eyebrow eyebrow--center">Feedback received</p>
          <h2>Thank you, {firstName}.</h2>
          <p className="feedback-card__sub">Your input helps us make the assistant more useful for everyone on the team.</p>
          <div className="feedback-card__actions">
            <button className="btn btn--ghost" onClick={onBack}>Back to chat</button>
            <button className="btn btn--primary" onClick={onDone}>Done</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view view--feedback">
      <form className="feedback-card" onSubmit={submit}>
        <button type="button" className="back-link" onClick={onBack}>
          <Icon name="chevron-left" />Back to chat
        </button>
        <p className="eyebrow"><Icon name="message" />Assistant feedback</p>
        <h2>Help us improve your experience.</h2>
        <p className="feedback-card__sub">Tell us how well the assistant supported your work today.</p>

        <fieldset className="fb-field">
          <legend id="fb-rating">How useful was your experience? <span aria-hidden="true">*</span></legend>
          <div
            className="rating"
            role="radiogroup"
            aria-labelledby="fb-rating"
            aria-required="true"
            aria-invalid={ratingError || undefined}
            aria-describedby={ratingError ? 'fb-rating-error' : undefined}
            onKeyDown={onRatingKey}
          >
            {RATINGS.map((label, i) => {
              const value = i + 1;
              const checked = rating === value;
              return (
                <button
                  key={label}
                  ref={(el) => { ratingRefs.current[i] = el; }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={`${value}, ${label}`}
                  tabIndex={checked || (!rating && value === 1) ? 0 : -1}
                  className="rating__opt"
                  onClick={() => { setRating(value); setRatingError(false); }}
                >
                  <strong>{value}</strong>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {ratingError && <p className="fb-error" id="fb-rating-error" role="alert">Choose a rating to submit your feedback.</p>}
        </fieldset>

        <fieldset className="fb-field">
          <legend>What would you like to comment on?</legend>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="fb-field">
          <label className="fb-label" htmlFor="fb-comment">
            Additional comments <span className="fb-label__opt">Optional</span>
          </label>
          <textarea
            id="fb-comment"
            rows={5}
            maxLength={MAX_COMMENT}
            value={comment}
            placeholder="Share details that would help us improve…"
            aria-describedby="fb-count"
            onChange={(e) => setComment(e.target.value)}
          />
          {/* Only announce when the limit is close, not on every keystroke. */}
          <span className="fb-count" id="fb-count" aria-live={comment.length >= MAX_COMMENT - 50 ? 'polite' : 'off'}>
            {comment.length}/{MAX_COMMENT}<span className="sr-only"> characters</span>
          </span>
        </div>

        <div className="feedback-card__submit">
          <button
            className={`btn btn--primary ${sending ? 'is-loading' : ''}`}
            type="submit"
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Submit feedback'}<Icon name="arrow-right" />
          </button>
        </div>
      </form>
    </section>
  );
}
