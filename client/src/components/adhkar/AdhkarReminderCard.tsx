import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { enablePush, getPushState } from '../../lib/push';
import {
  loadAdhkarPrefs,
  saveAdhkarPrefs,
  fetchServerAdhkarPrefs,
  saveServerAdhkarPrefs,
  sendServerTestAdhkarPush,
  requestReminderPermission,
  getNotificationPermission,
  sendAdhkarNotification,
  type AdhkarReminderPrefs,
} from '../../lib/adhkarReminders';

interface AdhkarReminderCardProps {
  onClose?: () => void;
}

export default function AdhkarReminderCard({ onClose }: AdhkarReminderCardProps) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AdhkarReminderPrefs>(loadAdhkarPrefs);
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

    const next: AdhkarReminderPrefs = { ...prefs, enabled: willEnable };
    setPrefs(next);
    saveAdhkarPrefs(next);
    if (user) {
      void saveServerAdhkarPrefs(next);
    }
  };

  const handleUpdate = (updater: (prev: AdhkarReminderPrefs) => AdhkarReminderPrefs) => {
    setPrefs((prev) => {
      const next = updater(prev);
      saveAdhkarPrefs(next);
      if (user) {
        void saveServerAdhkarPrefs(next);
      }
      return next;
    });
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
      <div className="mb-5 flex items-center justify-between rounded-xl border border-line bg-canvas/50 p-3.5">
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

      {/* Individual Ward Timings */}
      <div className={`space-y-3 transition-opacity ${prefs.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        {/* Morning */}
        <div className="flex items-center justify-between rounded-xl border border-line/80 bg-surface/80 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent">
              <Sun className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-fg">أذكار الصباح</p>
              <p className="text-[11px] text-muted">يبدأ من طلوع الفجر</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={prefs.morning.time}
              onChange={(e) =>
                handleUpdate((p) => ({
                  ...p,
                  morning: { ...p.morning, time: e.target.value },
                }))
              }
              disabled={!prefs.morning.enabled}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                handleUpdate((p) => ({
                  ...p,
                  morning: { ...p.morning, enabled: !p.morning.enabled },
                }))
              }
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                prefs.morning.enabled
                  ? 'bg-accent-soft text-accent'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              {prefs.morning.enabled ? 'مفعّل' : 'معطّل'}
            </button>
          </div>
        </div>

        {/* Evening */}
        <div className="flex items-center justify-between rounded-xl border border-line/80 bg-surface/80 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent">
              <Moon className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-fg">أذكار المساء</p>
              <p className="text-[11px] text-muted">يبدأ من بعد صلاة العصر</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={prefs.evening.time}
              onChange={(e) =>
                handleUpdate((p) => ({
                  ...p,
                  evening: { ...p.evening, time: e.target.value },
                }))
              }
              disabled={!prefs.evening.enabled}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                handleUpdate((p) => ({
                  ...p,
                  evening: { ...p.evening, enabled: !p.evening.enabled },
                }))
              }
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                prefs.evening.enabled
                  ? 'bg-accent-soft text-accent'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              {prefs.evening.enabled ? 'مفعّل' : 'معطّل'}
            </button>
          </div>
        </div>

        {/* Sleep */}
        <div className="flex items-center justify-between rounded-xl border border-line/80 bg-surface/80 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent">
              <Bed className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-fg">أذكار النوم</p>
              <p className="text-[11px] text-muted">قبل النوم والاضطجاع</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={prefs.sleep.time}
              onChange={(e) =>
                handleUpdate((p) => ({
                  ...p,
                  sleep: { ...p.sleep, time: e.target.value },
                }))
              }
              disabled={!prefs.sleep.enabled}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                handleUpdate((p) => ({
                  ...p,
                  sleep: { ...p.sleep, enabled: !p.sleep.enabled },
                }))
              }
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                prefs.sleep.enabled
                  ? 'bg-accent-soft text-accent'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              {prefs.sleep.enabled ? 'مفعّل' : 'معطّل'}
            </button>
          </div>
        </div>
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
