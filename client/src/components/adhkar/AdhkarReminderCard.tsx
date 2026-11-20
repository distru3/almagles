import { useState, useEffect, useId, type ReactNode } from 'react';
import {
  Bell,
  BellRing,
  Sun,
  Moon,
  Bed,
  Check,
  Send,
  X,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { enablePush, getPushState } from '../../lib/push';
import { METHODS, formatClock, loadPlace, type Place } from '../../lib/prayerTimes';
import type { AdhkarPrayerWard } from '../../lib/types';
import PlacePicker from '../PlacePicker';
import {
  loadAdhkarPrefs,
  saveAdhkarPrefs,
  fetchServerAdhkarPrefs,
  saveServerAdhkarPrefs,
  sendServerTestAdhkarPush,
  requestReminderPermission,
  getNotificationPermission,
  sendAdhkarNotification,
  syncAdhkarPlace,
  todaysReminderTimes,
  PRAYER_OFFSETS,
  type AdhkarReminderPrefs,
} from '../../lib/adhkarReminders';

interface AdhkarReminderCardProps {
  onClose?: () => void;
}

const arNumber = new Intl.NumberFormat('ar');

/** «مع أذان الفجر», «بعد العصر بـ١٠ دقائق», «بعد الفجر بساعة»… */
function offsetLabel(prayer: string, minutes: number): string {
  if (minutes === 0) return `مع أذان ${prayer}`;
  if (minutes === 60) return `بعد ${prayer} بساعة`;
  return `بعد ${prayer} بـ${arNumber.format(minutes)} ${minutes <= 10 ? 'دقائق' : 'دقيقة'}`;
}

const timeInputClass =
  'rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg focus:border-accent focus:outline-none disabled:opacity-60';

function WardRow({
  icon,
  title,
  hint,
  enabled,
  onToggle,
  at,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
  at: Date;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line/80 bg-surface/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">{icon}</span>
          <div>
            <p className="font-display text-sm font-bold text-fg">{title}</p>
            <p className="text-[11px] text-muted">{hint}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
          className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            enabled ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
          }`}
        >
          {enabled ? 'مفعّل' : 'معطّل'}
        </button>
      </div>
      <div className={`mt-2.5 flex flex-wrap items-center gap-2 ${enabled ? '' : 'opacity-60'}`}>
        {children}
        {enabled && (
          <span className="ms-auto font-display text-[11px] text-muted tabular-nums">
            موعده اليوم {formatClock(at)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Timing for «أذكار الصباح» / «أذكار المساء»: minutes after the prayer, or a clock time. */
function PrayerTiming({
  prayer,
  ward,
  onChange,
}: {
  prayer: string;
  ward: AdhkarPrayerWard;
  onChange: (w: AdhkarPrayerWard) => void;
}) {
  const uid = useId();
  return (
    <>
      <label htmlFor={`timing-${uid}`} className="sr-only">
        موعد التنبيه
      </label>
      <select
        id={`timing-${uid}`}
        value={ward.mode === 'fixed' ? 'fixed' : String(ward.offset)}
        disabled={!ward.enabled}
        onChange={(e) =>
          onChange(
            e.target.value === 'fixed'
              ? { ...ward, mode: 'fixed' }
              : { ...ward, mode: 'prayer', offset: Number(e.target.value) },
          )
        }
        className={timeInputClass}
      >
        {PRAYER_OFFSETS.map((m) => (
          <option key={m} value={m}>
            {offsetLabel(prayer, m)}
          </option>
        ))}
        <option value="fixed">وقت أختاره بنفسي</option>
      </select>
      {ward.mode === 'fixed' && (
        <input
          type="time"
          aria-label="الوقت"
          value={ward.time}
          disabled={!ward.enabled}
          onChange={(e) => e.target.value && onChange({ ...ward, time: e.target.value })}
          className={timeInputClass}
        />
      )}
    </>
  );
}

export default function AdhkarReminderCard({ onClose }: AdhkarReminderCardProps) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AdhkarReminderPrefs>(loadAdhkarPrefs);
  const [place, setPlace] = useState<Place>(loadPlace);
  const [editingPlace, setEditingPlace] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission);
  const [testSent, setTestSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    setPermission(getNotificationPermission());
    if (user) {
      void fetchServerAdhkarPrefs().then((serverPrefs) => {
        if (serverPrefs) setPrefs(serverPrefs);
      });
    }
  }, [user]);

  const times = todaysReminderTimes(prefs, place);

  const commit = (next: AdhkarReminderPrefs) => {
    setPrefs(next);
    saveAdhkarPrefs(next);
    if (user) {
      void saveServerAdhkarPrefs(next);
    }
  };

  const handleToggleMaster = async () => {
    const willEnable = !prefs.enabled;
    if (willEnable) {
      if (user) {
        const pushState = await enablePush();
        if (pushState === 'denied') {
          setPermission('denied');
          return;
        }
      } else if (permission !== 'granted') {
        const res = await requestReminderPermission();
        setPermission(res);
        if (res !== 'granted') return;
      }
    }
    commit({ ...prefs, enabled: willEnable });
  };

  // Reminders are timed by Fajr and Asr in this city, so the server needs it too.
  const handlePlace = (p: Place) => {
    setPlace(p);
    if (user) void syncAdhkarPlace(p);
  };

  const handleSendTest = async () => {
    setBusy(true);
    setTestSent(false);
    setTestError(null);
    try {
      if (user) {
        // Ensure device is subscribed first
        const state = await getPushState();
        if (state !== 'on') {
          await enablePush();
        }
        const rep = await sendServerTestAdhkarPush();
        if (rep && rep.sent > 0) {
          setTestSent(true);
          setTimeout(() => setTestSent(false), 4000);
        } else if (rep && rep.devices === 0) {
          setTestError('لم يُعثر على جهاز مسجّل، يرجى تفعيل الإشعارات وتأكيد الإذن');
        } else {
          // Fallback to local notification
          const ok = await sendAdhkarNotification('test');
          if (ok) {
            setTestSent(true);
            setTimeout(() => setTestSent(false), 4000);
          } else {
            setTestError('تعذّر إرسال التنبيه التجريبي');
          }
        }
      } else {
        const ok = await sendAdhkarNotification('test');
        if (ok) {
          setTestSent(true);
          setTimeout(() => setTestSent(false), 4000);
        } else {
          setTestError('تعذّر إرسال التنبيه التجريبي');
        }
      }
    } catch {
      setTestError('حدث خطأ أثناء إرسال التنبيه التجريبي');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-fg">
              تنبيهات أوقات الأذكار
            </h3>
            <p className="text-xs text-muted">
              تذكير يومي لطيف عند حلول موعد أذكار الصباح والمساء والنوم
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg transition"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Permission Warning if Blocked */}
      {permission === 'denied' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-xs text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            إشعارات المتصفح محظورة لهذا الموقع. يرجى تفعيل الإشعارات من إعدادات المتصفح أو شريط العنوان لاستلام التنبيهات.
          </span>
        </div>
      )}

      {/* Master Toggle */}
      <div className="mb-3 flex items-center justify-between rounded-xl border border-line bg-canvas/50 p-3.5">
        <div className="flex items-center gap-2.5">
          <Bell className="h-4 w-4 text-accent" />
          <span className="font-display text-sm font-bold text-fg">
            تفعيل التذكير اليومي بالأذكار
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleMaster}
          role="switch"
          aria-checked={prefs.enabled}
          aria-label="تفعيل التذكير اليومي بالأذكار"
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            prefs.enabled ? 'bg-accent-fill' : 'bg-line-strong'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              prefs.enabled ? '-translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* «مواقيت …»: morning and evening follow Fajr and Asr in this city. */}
      <div className="mb-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            المواقيت حسب {place.label} · {METHODS[place.method].name}
          </span>
          <button
            type="button"
            onClick={() => setEditingPlace((e) => !e)}
            className="font-display text-accent hover:text-accent-strong"
          >
            {editingPlace ? 'تم' : 'تغيير المدينة'}
          </button>
        </div>
        {editingPlace && <PlacePicker place={place} onPlace={handlePlace} />}
      </div>

      {/* Individual Ward Timings */}
      <div className={`space-y-3 transition-opacity ${prefs.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        <WardRow
          icon={<Sun className="h-4 w-4" />}
          title="أذكار الصباح"
          hint="يبدأ من طلوع الفجر"
          enabled={prefs.morning.enabled}
          onToggle={() => commit({ ...prefs, morning: { ...prefs.morning, enabled: !prefs.morning.enabled } })}
          at={times.morning}
        >
          <PrayerTiming prayer="الفجر" ward={prefs.morning} onChange={(morning) => commit({ ...prefs, morning })} />
        </WardRow>

        <WardRow
          icon={<Moon className="h-4 w-4" />}
          title="أذكار المساء"
          hint="يبدأ من بعد صلاة العصر"
          enabled={prefs.evening.enabled}
          onToggle={() => commit({ ...prefs, evening: { ...prefs.evening, enabled: !prefs.evening.enabled } })}
          at={times.evening}
        >
          <PrayerTiming prayer="العصر" ward={prefs.evening} onChange={(evening) => commit({ ...prefs, evening })} />
        </WardRow>

        <WardRow
          icon={<Bed className="h-4 w-4" />}
          title="أذكار النوم"
          hint="قبل النوم والاضطجاع"
          enabled={prefs.sleep.enabled}
          onToggle={() => commit({ ...prefs, sleep: { ...prefs.sleep, enabled: !prefs.sleep.enabled } })}
          at={times.sleep}
        >
          <input
            type="time"
            aria-label="وقت أذكار النوم"
            value={prefs.sleep.time}
            disabled={!prefs.sleep.enabled}
            onChange={(e) => e.target.value && commit({ ...prefs, sleep: { ...prefs.sleep, time: e.target.value } })}
            className={timeInputClass}
          />
        </WardRow>
      </div>

      {/* Test Button & Help note */}
      <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted max-w-sm">
          يصلك التنبيه كإشعار على شاشة هاتفك أو حاسوبك، والنقر عليه يفتح صفحة الورد المحددة فوراً.
        </p>

        <button
          type="button"
          onClick={handleSendTest}
          disabled={busy}
          className="btn-outline !min-h-9 !py-1.5 !px-3.5 text-xs font-bold inline-flex items-center gap-1.5"
        >
          {testSent ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" />
              <span>أُرسل الإشعار التجريبي!</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 text-accent" />
              <span>إرسال تنبيه تجريبي الآن</span>
            </>
          )}
        </button>
      </div>

      {testError && (
        <p className="mt-2 text-xs text-danger">{testError}</p>
      )}
    </div>
  );
}
