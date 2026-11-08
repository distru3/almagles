import { api, ApiError } from './api';

/**
 * Where this device stands with phone/desktop popups:
 * - unsupported: the browser has no push at all
 * - needs-install: iPhone/iPad, which only allow push once the site is added to the home screen
 * - unavailable: the server has no push keys configured
 * - denied: the user blocked notifications for this site
 * - error: allowed and subscribed in the browser, but the server couldn't save this device
 * - off / on: ready to be turned on, or on (the server has this device)
 */
export type PushState = 'unsupported' | 'needs-install' | 'unavailable' | 'denied' | 'error' | 'off' | 'on';

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function hasPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers /sw.js once; resolves to null where service workers aren't available. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  registration ??=
    'serviceWorker' in navigator
      ? navigator.serviceWorker.register('/sw.js').then(
          () => navigator.serviceWorker.ready,
          () => null,
        )
      : Promise.resolve(null);
  return registration;
}

let publicKey: Promise<string | null> | null = null;

function serverKey(): Promise<string | null> {
  publicKey ??= api<{ publicKey: string | null }>('/push/public-key')
    .then((r) => r.publicKey)
    .catch(() => {
      publicKey = null; // try again next time
      return null;
    });
  return publicKey;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!hasPush()) return null;
  const reg = await registerServiceWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** The endpoint the server has confirmed saving during this visit, and the last reason it couldn't. */
let confirmedEndpoint: string | null = null;
let lastError: string | null = null;

/** Why the last attempt failed, in words for the person (shown under the card). */
export function pushError(): string | null {
  return lastError;
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof DOMException && err.name === 'NotAllowedError') return 'رفض المتصفح الاشتراك في الإشعارات';
  if (err instanceof Error && err.message) return err.message;
  return 'تعذّر تفعيل الإشعارات';
}

async function saveOnServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await api('/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
  confirmedEndpoint = sub.endpoint;
}

export async function getPushState(): Promise<PushState> {
  if (!hasPush()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (!(await serverKey())) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await currentSubscription();
  if (!sub) return 'off';
  if (sub.endpoint === confirmedEndpoint) return 'on';
  // Allowed in the browser: make sure the server really has this device (once per visit).
  try {
    await saveOnServer(sub);
    lastError = null;
    return 'on';
  } catch (err) {
    lastError = describe(err);
    return 'error';
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Asks for permission and registers this device. Must run straight from a tap:
 * Safari (iPhone) only shows the permission prompt when it is the very first
 * thing the tap does, so nothing is awaited before it.
 */
export async function enablePush(): Promise<PushState> {
  if (!hasPush()) return getPushState();
  lastError = null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  try {
    const key = await serverKey();
    if (!key) return 'unavailable';
    const reg = await registerServiceWorker();
    if (!reg) return 'unsupported';
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await saveOnServer(sub);
    return 'on';
  } catch (err) {
    lastError = describe(err);
    return 'error';
  }
}

/** Stops popups on this device (the account's other devices keep theirs). */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  confirmedEndpoint = null;
  lastError = null;
  return getPushState();
}

export interface TestReport {
  devices: number;
  sent: number;
  failures: { service: string; status: number | null; reason: string }[];
}

/** Sends a test popup to every device of this account; resolves with what each push service said. */
export function sendTestPush(): Promise<TestReport> {
  return api<TestReport>('/push/test', { method: 'POST' });
}
