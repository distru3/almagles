import { todayISO } from './dates';

export interface AdhkarReminderPrefs {
  enabled: boolean;
  morning: {
    enabled: boolean;
    time: string; // "06:00"
  };
  evening: {
    enabled: boolean;
    time: string; // "16:30"
  };
  sleep: {
    enabled: boolean;
    time: string; // "22:30"
  };
}

const STORAGE_KEY = 'almagles_adhkar_reminders';
const NOTIFIED_PREFIX = 'almagles_adhkar_last_notified_';

export const DEFAULT_PREFS: AdhkarReminderPrefs = {
  enabled: false,
  morning: {
    enabled: true,
    time: '06:00',
  },
  evening: {
    enabled: true,
    time: '16:30',
  },
  sleep: {
    enabled: true,
    time: '22:30',
  },
};

export function loadAdhkarPrefs(): AdhkarReminderPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      morning: {
        enabled: Boolean(parsed.morning?.enabled ?? true),
        time: parsed.morning?.time || '06:00',
      },
      evening: {
        enabled: Boolean(parsed.evening?.enabled ?? true),
        time: parsed.evening?.time || '16:30',
      },
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

/** Check if current time matches any adhkar schedule, and dispatch if not yet sent today. */
export function checkAdhkarReminders(): void {
  const prefs = loadAdhkarPrefs();
  if (!prefs.enabled) return;
  if (getNotificationPermission() !== 'granted') return;

  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = todayISO();

  const types: ('morning' | 'evening' | 'sleep')[] = ['morning', 'evening', 'sleep'];

  for (const t of types) {
    const conf = prefs[t];
    if (!conf.enabled) continue;

    // Check if within 2 minutes of the target time
    if (conf.time === currentHHMM) {
      const lastKey = `${NOTIFIED_PREFIX}${t}`;
      const lastDate = localStorage.getItem(lastKey);
      if (lastDate !== today) {
        localStorage.setItem(lastKey, today);
        void sendAdhkarNotification(t);
      }
    }
  }
}
