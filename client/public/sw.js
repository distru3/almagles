// Service worker: shows push notifications as phone/desktop popups, even when
// the site is closed, and opens the right page when one is tapped.
// Plain JS served as-is from /sw.js (not bundled), so it can control the whole site.

const ICON = '/icons/icon-192.png';
// Android's status bar shows only this silhouette.
const BADGE = '/icons/badge-96.png';
// «حان وقت المجلس»: long buzzes. Android only — iPhones play their normal notification sound and
// ignore this. A web app can't choose its own ringtone or ring until answered like an alarm.
const RING_VIBRATION = [800, 300, 800, 300, 800, 300, 800];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      // Open tabs refresh their bell straight away instead of waiting for the next poll.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'notification' });

      // Always show it: Safari cancels push for sites that receive one without showing a popup.
      await self.registration.showNotification(data.title || 'رجال الأمة', {
        body: data.body || '',
        icon: ICON,
        badge: BADGE,
        tag: data.tag,
        renotify: Boolean(data.tag),
        // Stays on screen until dismissed (desktop, Android) instead of sliding away.
        requireInteraction: Boolean(data.ring),
        vibrate: data.ring ? RING_VIBRATION : undefined,
        silent: false,
        lang: 'ar',
        dir: 'rtl',
        data: { url: data.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // The app navigates itself (no reload) and marks it read.
        await open.focus();
        open.postMessage({ type: 'open', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
