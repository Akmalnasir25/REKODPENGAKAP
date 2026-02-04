// Rate Limiting & Brute Force Protection
const RATE_LIMIT_KEY = 'LOGIN_ATTEMPTS';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LoginAttempt {
  count: number;
  firstAttemptTime: number;
  lastAttemptTime: number;
  lockedUntil?: number;
}

export const checkLoginAttempts = (): { canAttempt: boolean; timeRemaining: number } => {
  const stored = localStorage.getItem(RATE_LIMIT_KEY);
  const now = Date.now();

  if (!stored) {
    return { canAttempt: true, timeRemaining: 0 };
  }

  const attempts: LoginAttempt = JSON.parse(stored);

  // Check if lockout has expired
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const timeRemaining = Math.ceil((attempts.lockedUntil - now) / 1000);
    return { canAttempt: false, timeRemaining };
  }

  // Reset if window has passed
  if (now - attempts.firstAttemptTime > LOCKOUT_DURATION_MS) {
    localStorage.removeItem(RATE_LIMIT_KEY);
    return { canAttempt: true, timeRemaining: 0 };
  }

  return { canAttempt: true, timeRemaining: 0 };
};

export const recordLoginAttempt = (success: boolean): void => {
  const stored = localStorage.getItem(RATE_LIMIT_KEY);
  const now = Date.now();

  if (!stored) {
    const newAttempt: LoginAttempt = {
      count: success ? 0 : 1,
      firstAttemptTime: now,
      lastAttemptTime: now,
    };
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newAttempt));
    return;
  }

  const attempts: LoginAttempt = JSON.parse(stored);

  // Reset if window has passed
  if (now - attempts.firstAttemptTime > LOCKOUT_DURATION_MS) {
    localStorage.removeItem(RATE_LIMIT_KEY);
    const newAttempt: LoginAttempt = {
      count: success ? 0 : 1,
      firstAttemptTime: now,
      lastAttemptTime: now,
    };
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newAttempt));
    return;
  }

  // Success: reset attempts
  if (success) {
    localStorage.removeItem(RATE_LIMIT_KEY);
    return;
  }

  // Failed attempt
  attempts.count += 1;
  attempts.lastAttemptTime = now;

  // Lock account if max attempts reached
  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(attempts));
};

export const clearLoginAttempts = (): void => {
  localStorage.removeItem(RATE_LIMIT_KEY);
};

// CSRF Token Management
const CSRF_TOKEN_KEY = 'CSRF_TOKEN';
const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const generateCSRFToken = (): string => {
  const stored = localStorage.getItem(CSRF_TOKEN_KEY);
  const now = Date.now();

  if (stored) {
    try {
      const { token, expiresAt } = JSON.parse(stored);
      if (expiresAt && now < expiresAt) {
        return token;
      }
    } catch (e) {
      // Invalid stored token, generate new one
    }
  }

  // Generate new token
  const randomPart = Math.random().toString(36).substring(2, 15);
  const timePart = Date.now().toString(36);
  const token = `${timePart}_${randomPart}`;

  const tokenData = {
    token,
    expiresAt: now + CSRF_TOKEN_EXPIRY_MS,
  };

  localStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify(tokenData));
  return token;
};

export const validateCSRFToken = (token: string): boolean => {
  const stored = localStorage.getItem(CSRF_TOKEN_KEY);

  if (!stored) {
    return false;
  }

  try {
    const { token: storedToken, expiresAt } = JSON.parse(stored);
    return storedToken === token && Date.now() < expiresAt;
  } catch (e) {
    return false;
  }
};

// Fetch server-issued CSRF token from Apps Script endpoint
export const fetchServerCsrf = async (scriptUrl: string): Promise<string | null> => {
  if (!scriptUrl) return null;
  try {
    const resp = await fetch(`${scriptUrl}?action=get_csrf&t=${Date.now()}`, { method: 'GET', mode: 'cors', credentials: 'omit' });
    const j = await resp.json();
    if (j && j.status === 'success' && j.csrfToken) return j.csrfToken;
    return null;
  } catch (e) {
    console.warn('fetchServerCsrf failed', e);
    return null;
  }
};

// Session Management with Timeout
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_ACTIVITY_KEY = 'SESSION_LAST_ACTIVITY';

export const updateSessionActivity = (): void => {
  localStorage.setItem(SESSION_ACTIVITY_KEY, Date.now().toString());
};

export const getSessionActivityTime = (): number => {
  const stored = localStorage.getItem(SESSION_ACTIVITY_KEY);
  return stored ? parseInt(stored, 10) : 0;
};

export const isSessionExpired = (): boolean => {
  const lastActivity = getSessionActivityTime();
  if (!lastActivity) {
    return false;
  }
  return Date.now() - lastActivity > SESSION_TIMEOUT_MS;
};

export const clearSessionActivity = (): void => {
  localStorage.removeItem(SESSION_ACTIVITY_KEY);
};
