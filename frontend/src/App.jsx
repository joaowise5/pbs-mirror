import { useEffect, useState } from 'react';
import LoadingScreen from './components/LoadingScreen.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import AppShell from './components/AppShell.jsx';
import { auth } from './services/auth.js';
import { assistant } from './services/assistant.js';
import { useTheme } from './lib/theme.js';

const MIN_BOOT_MS = 600; // keep the loading screen from flashing
const HEALTH_TIMEOUT_MS = 3000;

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export default function App() {
  const { themePreference, setThemePreference } = useTheme();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [backendStatus, setBackendStatus] = useState('offline');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.resolve(auth.currentUser()),
      withTimeout(assistant.health().catch(() => ({ ok: false })), HEALTH_TIMEOUT_MS, { ok: false }),
      new Promise((resolve) => setTimeout(resolve, MIN_BOOT_MS)),
    ]).then(([restored, health]) => {
      if (cancelled) return;
      setUser(restored);
      setBackendStatus(health.ok ? 'online' : 'offline');
      setBooting(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (booting) return <LoadingScreen />;
  if (!user) return <LoginScreen onSignIn={setUser} themePreference={themePreference} onThemeChange={setThemePreference} />;

  return (
    <AppShell
      user={user}
      themePreference={themePreference}
      onThemeChange={setThemePreference}
      backendStatus={backendStatus}
      onSignOut={() => {
        auth.signOut();
        setUser(null);
      }}
    />
  );
}
