import { api } from './api';
import { loadPlace, loadSavedPlace, prayerTimes, type Place } from './prayerTimes';
import type { AdhkarPrayerWard, AdhkarReminderSettings } from './types';

export interface AdhkarReminderPrefs {
  enabled: boolean;
  timeZone?: string;
  /** Minutes after Fajr, or a fixed clock time ("06:00"). */
  morning: AdhkarPrayerWard;
  /** Minutes after Asr, or a fixed clock time ("16:30"). */
  evening: AdhkarPrayerWard;
  sleep: {
    enabled: boolean;
    time: string; // "22:30"
  };
}

const STORAGE_KEY = 'almagles_adhkar_reminders';

/** Minutes after the prayer offered in «تنبيهات أوقات الأذكار». */
export const PRAYER_OFFSETS = [0, 10, 20, 30, 45, 60];
export const DEFAULT_OFFSET = 20;

export function detectDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === 'string' && tz.includes('/')) return tz;
  } catch {
    /* fallback */
  }
  return 'Asia/Riyadh';
}

export const DEFAULT_PREFS: AdhkarReminderPrefs = {
  enabled: false,
  timeZone: detectDeviceTimeZone(),
  morning: { enabled: true, time: '06:00', mode: 'prayer', offset: DEFAULT_OFFSET },
  evening: { enabled: true, time: '16:30', mode: 'prayer', offset: DEFAULT_OFFSET },
  sleep: { enabled: true, time: '22:30' },
};

function ward(raw: Partial<AdhkarPrayerWard> | undefined, fallback: AdhkarPrayerWard): AdhkarPrayerWard {
  return {
    enabled: Boolean(raw?.enabled ?? fallback.enabled),
    time: raw?.time || fallback.time,
    mode: raw?.mode === 'fixed' ? 'fixed' : 'prayer',
    offset: Number.isInteger(raw?.offset) ? raw!.offset! : fallback.offset,
  };
}

export function loadAdhkarPrefs(): AdhkarReminderPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      timeZone: parsed.timeZone || detectDeviceTimeZone(),
      morning: ward(parsed.morning, DEFAULT_PREFS.morning),
      evening: ward(parsed.evening, DEFAULT_PREFS.evening),
      sleep: {
        enabled: Boolean(parsed.sleep?.enabled ?? true),
        time: parsed.sleep?.time || '22:30',
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveAdhkarPrefs(prefs: AdhkarReminderPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/**
 * The place to time reminders for. If the member never chose a city on this
 * device it's a guess from the time zone, flagged so the server won't let it
 * replace a city they chose elsewhere.
 */
function placePayload(place?: Place) {
  const chosen = place ?? loadSavedPlace();
  const p = chosen ?? loadPlace();
  return { lat: p.lat, lng: p.lng, method: p.method, label: p.label, guessed: !chosen };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * When each reminder arrives today on this device's clock — the same rule as
 * the server's `reminderTimes`: Fajr/Asr plus the offset, or the fixed time.
 */
export function todaysReminderTimes(prefs: AdhkarReminderPrefs, place: Place, now = new Date()) {
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const prayers = prayerTimes(iso, place);
  const clock = (hhmm: string) => {
    const d = new Date(now);
    d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)), 0, 0);
    return d;
  };
  const after = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);
  return {
    morning: prefs.morning.mode === 'prayer' ? after(prayers.fajr, prefs.morning.offset) : clock(prefs.morning.time),
    evening: prefs.evening.mode === 'prayer' ? after(prayers.asr, prefs.evening.offset) : clock(prefs.evening.time),
    sleep: clock(prefs.sleep.time),
  };
}

export async function fetchServerAdhkarPrefs(): Promise<AdhkarReminderPrefs | null> {
  try {
    const deviceTz = detectDeviceTimeZone();
    const p = placePayload();
    const q = new URLSearchParams({ tz: deviceTz, lat: String(p.lat), lng: String(p.lng), method: p.method, label: p.label });
    if (p.guessed) q.set('guessed', '1');
    const res = await api<AdhkarReminderSettings>(`/adhkar/reminders?${q}`);
    const prefs: AdhkarReminderPrefs = {
      enabled: res.enabled,
      timeZone: res.timeZone || deviceTz,
      morning: ward(res.morning, DEFAULT_PREFS.morning),
      evening: ward(res.evening, DEFAULT_PREFS.evening),
      sleep: res.sleep,
    };
    saveAdhkarPrefs(prefs);
    return prefs;
  } catch {
    return null;
  }
}

export async function saveServerAdhkarPrefs(prefs: AdhkarReminderPrefs): Promise<boolean> {
  try {
    const tz = detectDeviceTimeZone();
    await api('/adhkar/reminders', {
      method: 'PUT',
      body: {
        enabled: prefs.enabled,
        timeZone: tz,
        place: placePayload(),
        morning: prefs.morning,
        evening: prefs.evening,
        sleep: prefs.sleep,
      },
    });
    saveAdhkarPrefs({ ...prefs, timeZone: tz });
    return true;
  } catch {
    saveAdhkarPrefs(prefs);
    return false;
  }
}

/** The member chose a city (here or on the tasks page): move their adhkar reminders with it. */
export async function syncAdhkarPlace(place: Place): Promise<void> {
  try {
    await api('/adhkar/reminders', { method: 'PUT', body: { timeZone: detectDeviceTimeZone(), place: placePayload(place) } });
  } catch {
    /* not signed in or offline — the next visit to the adhkar page syncs it */
  }
}

export async function sendServerTestAdhkarPush(): Promise<{ sent: number; devices: number; failures: unknown[] } | null> {
  try {
    return await api<{ sent: number; devices: number; failures: unknown[] }>('/adhkar/reminders/test', { method: 'POST' });
  } catch {
    return null;
  }
}

export async function requestReminderPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

const NOTIFICATION_CONTENT = {
  morning: {
    title: 'أذكار الصباح · رجال الأمة',
    body: 'أصبحنا وأصبح الملك لله. حان وقت أذكار الصباح لحفظك وبركة يومك.',
    url: '/adhkar?type=morning',
    tag: 'adhkar-morning',
  },
  evening: {
    title: 'أذكار المساء · رجال الأمة',
    body: 'أمسينا وأمسى الملك لله. حان وقت أذكار المساء لتحصين نفسك وأهلك.',
    url: '/adhkar?type=evening',
    tag: 'adhkar-evening',
  },
  sleep: {
    title: 'أذكار النوم · رجال الأمة',
    body: 'رتل أذكارك بيقين، واختم يومك بذكر الله وتوكل عليه قبل النوم.',
    url: '/adhkar?type=sleep',
    tag: 'adhkar-sleep',
  },
  test: {
    title: 'تنبيه الأذكار التجريبي · رجال الأمة',
    body: 'تم تفعيل التنبيهات بنجاح. ستصلك إشعارات الأذكار في مواعيدها المحددة.',
    url: '/adhkar',
    tag: 'adhkar-test',
  },
} as const;

export async function sendAdhkarNotification(
  type: 'morning' | 'evening' | 'sleep' | 'test'
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    const perm = await requestReminderPermission();
    if (perm !== 'granted') return false;
  }

  const item = NOTIFICATION_CONTENT[type];
  const options: NotificationOptions = {
    body: item.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: item.tag,
    data: { url: item.url },
    lang: 'ar',
    dir: 'rtl',
  };

  try {
    // Try service worker registration first for reliable mobile background push
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(item.title, options);
        return true;
      }
    }
  } catch {
    /* fallback to desktop Notification */
  }

  try {
    const notif = new Notification(item.title, options);
    notif.onclick = () => {
      window.focus();
      window.location.href = item.url;
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

