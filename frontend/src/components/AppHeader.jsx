import ThemeSwitcher from './ThemeSwitcher.jsx';
import { initials } from '../lib/format.js';
import { Icon, Logo } from './Icons.jsx';

export default function AppHeader({
  user, backendStatus, showSampleBadge, onMenu, onSignOut, themePreference, onThemeChange,
  menuButtonRef, menuOpen = false, inertProps = {},
}) {
  const online = backendStatus === 'online';

  return (
    <header className="app-header" {...inertProps}>
      <button
        ref={menuButtonRef}
        className="icon-btn app-header__menu"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={onMenu}
      >
        <Icon name="menu" />
      </button>
      <div className="app-header__brand">
        <Logo tone="blue" />
        <span className="app-header__product">Help Assistant</span>
      </div>

      <div className="app-header__right">
        <ThemeSwitcher preference={themePreference} onChange={onThemeChange} />
        {showSampleBadge && (
          <span className="pill pill--proto" title="No live AI or PBS systems are connected">Sample data</span>
        )}
        <span className={`kb-status ${online ? 'is-online' : 'is-offline'}`}>
          <i aria-hidden="true" />
          {/* Visually hidden on small screens, but still read by assistive tech. */}
        <span className="kb-status__text">Knowledge base {online ? 'online' : 'offline'}</span>
        </span>
        <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
        <span className="app-header__name">{user.name}</span>
        <button className="text-btn" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}
