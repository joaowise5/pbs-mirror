import ThemeSwitcher from './ThemeSwitcher.jsx';
import { useEffect, useRef, useState } from 'react';
import { auth } from '../services/auth.js';
import { Icon, Logo } from './Icons.jsx';

export default function LoginScreen({ onSignIn, themePreference, onThemeChange }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // { message, field }
  const [showInfo, setShowInfo] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    document.title = 'Sign in · PBS Wisconsin Help Assistant';
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setHelpOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const fail = (message, field) => {
    setError({ message, field });
    setShowInfo(false);
    (field === 'password' ? passwordRef : emailRef).current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      return fail('Enter your email and password to continue.', !email.trim() ? 'email' : 'password');
    }
    if (mode === 'register' && password.length < 8) {
      return fail('Password must be at least 8 characters.', 'password');
    }
    setLoading(true);
    try {
      const user = mode === 'register'
        ? await auth.register(email, password)
        : await auth.signIn(email, password);
      onSignIn(user);
    } catch (err) {
      fail(err.message, 'email');
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'signin' ? 'register' : 'signin'));
    setError(null);
    setShowInfo(false);
  };

  return (
    <div className="login">
      <header className="login__brand">
        <Logo />
        <ThemeSwitcher preference={themePreference} onChange={onThemeChange} onBrand />
      </header>

      <main className="login__main">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <p className="eyebrow"><Icon name="lock" />Staff access</p>
          <h1 className="login-card__title">
            {mode === 'register' ? 'Create account' : 'Welcome back'}
          </h1>
          <p className="login-card__sub">
            {mode === 'register'
              ? 'Register an account to save your conversation history.'
              : 'Sign in with your PBS Wisconsin credentials.'}
          </p>

          <label className="field-label" htmlFor="login-email">Work email</label>
          <div className="input-wrap">
            <span aria-hidden="true"><Icon name="mail" /></span>
            <input
              id="login-email"
              ref={emailRef}
              type="email"
              autoComplete="username"
              placeholder="name@pbswisconsin.org"
              autoFocus
              value={email}
              aria-invalid={error?.field === 'email' || undefined}
              aria-describedby={error?.field === 'email' ? 'login-error' : undefined}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
            />
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="login-password">Password</label>
            {mode === 'signin' && (
              <button type="button" className="link" onClick={() => { setShowInfo(true); setError(null); }}>
                Forgot password?
              </button>
            )}
          </div>
          <div className="input-wrap">
            <span aria-hidden="true"><Icon name="lock" /></span>
            <input
              id="login-password"
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
              value={password}
              aria-invalid={error?.field === 'password' || undefined}
              aria-describedby={error?.field === 'password' ? 'login-error' : undefined}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
            />
            <button
              type="button"
              className="input-wrap__toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} />
            </button>
          </div>

          {error && (
            <div className="alert alert--error" role="alert" id="login-error">
              <Icon name="alert" /><span>{error.message}</span>
            </div>
          )}
          {showInfo && (
            <div className="alert alert--info" role="status">
              <Icon name="info" />
              <span>Password resets are handled by PBS Wisconsin IT. In production this links to the self-service reset portal.</span>
            </div>
          )}

          <button className={`btn btn--primary btn--lg btn--block ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading}>
            <span>
              {loading
                ? (mode === 'register' ? 'Creating account…' : 'Signing in…')
                : (mode === 'register' ? 'Create account' : 'Sign in')}
            </span>
            <Icon name="arrow-right" />
          </button>

          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button type="button" className="link" onClick={toggleMode}>
              {mode === 'register'
                ? 'Already have an account? Sign in'
                : 'Need an account? Create one'}
            </button>
          </div>

          <div className="secure-note">
            <span className="secure-note__icon"><Icon name="lock" /></span>
            <div>
              <strong>Secure internal system</strong>
              <span>Access is limited to authorized staff.</span>
            </div>
          </div>
        </form>
      </main>

      <button
        className="help-fab"
        type="button"
        aria-label="Sign-in help"
        aria-expanded={helpOpen}
        aria-controls="help-pop"
        onClick={() => setHelpOpen((v) => !v)}
      >
        ?
      </button>
      {helpOpen && (
        <div className="help-pop" id="help-pop">
          <strong>Trouble signing in?</strong>
          <p>Contact the PBS Wisconsin IT help desk, or ask your Audience Services lead to confirm your access.</p>
        </div>
      )}
    </div>
  );
}