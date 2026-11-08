import { api } from './api';

/**
 * Where this device stands with phone/desktop popups:
 * - unsupported: the browser has no push at all
 * - needs-install: iPhone/iPad, which only allow push once the site is added to the home screen
 * - unavailable: the server has no push keys configured
 * - denied: the user blocked notifications for this site
 * - off / on: ready to be turned on, or already on
 */
export type PushState = 'unsupported' | 'needs-install' | 'unavailable' | 'denied' | 'off' | 'on';

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

export async function getPushState(): Promise<PushState> {
  if (!hasPush()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (!(await serverKey())) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && (await currentSubscription()) ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function saveOnServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await api('/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
}

/** Asks for permission (must run from a tap/click) and registers this device. */
export async function enablePush(): Promise<PushState> {
  if (!hasPush()) return getPushState();
  const key = await serverKey();
  if (!key) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await registerServiceWorker();
  if (!reg) return 'unsupported';
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await saveOnServer(sub);
  return 'on';
}

/** Stops popups on this device (the account's other devices keep theirs). */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return getPushState();
}

/**
 * After login: a device that already has popups on is (re)linked to this
 * account, in case the server dropped it or keys changed.
 */
export async function resyncPush(): Promise<void> {
  if (!hasPush() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await saveOnServer(sub).catch(() => undefined);
}
