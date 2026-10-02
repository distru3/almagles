function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const BASE = '/api';

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  const fresh = readCookie('alm_csrf');
  if (fresh) {
    csrfToken = fresh;
    return fresh;
  }
  if (csrfToken) return csrfToken;
  try {
    const res = await fetch(`${BASE}/auth/csrf`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.token ?? null;
      if (csrfToken) return csrfToken;
    }
  } catch {
    /* offline */
  }
  return '';
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function rawRequest(path: string, opts: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  const method = opts.method ?? 'GET';

  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CSRF-Token'] = await ensureCsrf();
  }

  return fetch(BASE + path, {
    method,
    headers,
    body,
    credentials: 'include',
  });
}

async function parseResponse(res: Response): Promise<any> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.message ?? 'حدث خطأ في الخادم', res.status);
  }
  return data;
}

// Auth endpoints where a 401 means "bad credentials", not "access token lapsed".
const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/signup',
  '/auth/refresh',
  '/auth/logout',
  '/auth/send-code',
  '/auth/reset-password',
]);

// Single-flight: concurrent 401s share one refresh call, so parallel requests
// don't rotate the refresh token out from under each other.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= rawRequest('/auth/refresh', { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const res = await rawRequest(path, opts);

  if (res.status === 401 && !retried && !NO_REFRESH_PATHS.has(path)) {
    // The access token lives 15 minutes; the refresh cookie keeps the session alive.
    if (await refreshSession()) {
      return api<T>(path, opts, true);
    }
  }

  return parseResponse(res);
}
