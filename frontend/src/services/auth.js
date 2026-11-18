const TOKEN_KEY = 'pbsw-access-token';

function nameFromEmail(email) {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

function formatUser(apiUser) {
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: nameFromEmail(apiUser.email),
    team: 'Audience Services',
  };
}

export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
}

async function fetchMe(token) {
  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    setAuthToken(null);
    return null;
  }
  const data = await res.json();
  return formatUser(data);
}

export const auth = {
  async currentUser() {
    const token = getAuthToken();
    if (!token) return null;
    return await fetchMe(token);
  },

  async signIn(email, password) {
    const clean = email.trim().toLowerCase();
    if (!clean) throw new Error('Enter a valid email address.');
    if (!password) throw new Error('Enter your password.');

    const formData = new URLSearchParams();
    formData.append('username', clean);
    formData.append('password', password);

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Incorrect email or password.');
    }

    const { access_token } = await res.json();
    setAuthToken(access_token);
    return await fetchMe(access_token);
  },

  async register(email, password) {
    const clean = email.trim().toLowerCase();
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clean, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed.');
    }

    const { access_token } = await res.json();
    setAuthToken(access_token);
    return await fetchMe(access_token);
  },

  signOut() {
    setAuthToken(null);
  },
};