import { useState } from 'react';
import { AlertTriangle, BellOff, BellRing, Download, Send, Share, SquarePlus, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { useAuth } from '../context/AuthContext';
import { useInstallPrompt } from '../lib/install';
import { pushError, sendTestPush } from '../lib/push';
import type { TestReport } from '../lib/push';
import { ApiError } from '../lib/api';
import { arNumber } from './reactions';

function Card({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
        <div className="min-w-0">
          <p className="font-display font-bold text-fg">{title}</p>
          {children && <div className="mt-1 text-sm leading-7 text-fg-2">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

const SERVICE_NAMES: Record<string, string> = { apple: 'آبل', google: 'جوجل', mozilla: 'موزيلا', microsoft: 'مايكروسوفت' };

/** What the test push did, in words — including the push service's own reason when it refused. */
function TestResult({ report }: { report: TestReport | string }) {
  if (typeof report === 'string') return <p className="mt-2 text-sm text-danger">{report}</p>;
  if (!report.devices) return <p className="mt-2 text-sm text-danger">لا يوجد جهاز مسجّل لحسابك — أوقف الإشعارات وفعّلها من جديد.</p>;
  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className={report.failures.length ? 'text-warn' : 'text-success'}>
        أُرسل إلى {arNumber.format(report.sent)} من {arNumber.format(report.devices)} {report.devices === 1 ? 'جهاز' : 'أجهزة'}
        {report.sent ? ' — يُفترض أن يظهر الإشعار خلال ثوانٍ.' : '.'}
      </p>
      {report.failures.map((f, i) => (
        <p key={i} className="break-words text-danger" dir="auto">
          رفضته خدمة {SERVICE_NAMES[f.service] ?? f.service}
          {f.status ? ` (${f.status})` : ''}: <code className="text-xs">{f.reason}</code>
        </p>
      ))}
    </div>
  );
}

/** Turning phone/desktop popups on or off for this device, with the steps each platform needs. */
export default function PushSettings() {
  const { pushState, pushBusy, turnOnPush, turnOffPush } = useNotifications();
  const { user } = useAuth();
  const { install } = useInstallPrompt();
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<TestReport | string | null>(null);

  const runTest = async () => {
    setTesting(true);
    setReport(null);
    try {
      setReport(await sendTestPush());
    } catch (err) {
      setReport(err instanceof ApiError ? err.message : 'تعذّر إرسال الإشعار التجريبي');
    } finally {
      setTesting(false);
    }
  };

  const installButton = install && (
    <button type="button" onClick={install} className="btn-outline !min-h-10 !text-sm">
      <Download className="h-4 w-4" />
      تثبيت التطبيق
    </button>
  );

  switch (pushState) {
    case 'on':
      return (
        <Card
          icon={<BellRing className="h-5 w-5" />}
          title="الإشعارات مفعّلة على هذا الجهاز"
          action={
            <>
              {installButton}
              <button type="button" onClick={runTest} disabled={testing} className="btn-outline !min-h-10 !text-sm">
                <Send className="h-4 w-4" />
                {testing ? 'جارٍ الإرسال…' : 'إرسال إشعار تجريبي'}
              </button>
              <button type="button" onClick={turnOffPush} disabled={pushBusy} className="btn-outline !min-h-10 !text-sm">
                <BellOff className="h-4 w-4" />
                إيقاف
              </button>
            </>
          }
        >
          تصلك الإشعارات فوراً حتى والموقع مغلق.
          {report && <TestResult report={report} />}
        </Card>
      );

    case 'off':
    case 'error':
      return (
        <Card
          icon={pushState === 'error' ? <AlertTriangle className="h-5 w-5 text-danger" /> : <Smartphone className="h-5 w-5" />}
          title={pushState === 'error' ? 'لم يكتمل تفعيل الإشعارات على هذا الجهاز' : 'إشعارات فورية على هاتفك'}
          action={
            <>
              {installButton}
              <button type="button" onClick={turnOnPush} disabled={pushBusy} className="btn-primary !min-h-10 !text-sm">
                <BellRing className="h-4 w-4" />
                {pushBusy ? 'جارٍ التفعيل…' : pushState === 'error' ? 'إعادة المحاولة' : 'تفعيل الإشعارات'}
              </button>
            </>
          }
        >
          تظهر لك الردود والتعليقات والمنشورات الجديدة كإشعار على الهاتف، حتى والموقع مغلق.
          {pushState === 'error' && pushError() && <p className="mt-1 text-danger">{pushError()}</p>}
        </Card>
      );

    case 'needs-install':
      return (
        <Card icon={<Smartphone className="h-5 w-5" />} title="لتصلك الإشعارات على الآيفون">
          <ol className="list-decimal space-y-0.5 ps-5">
            <li>
              اضغط زر المشاركة <Share className="inline h-4 w-4 align-[-2px]" aria-label="مشاركة" /> في سفاري.
            </li>
            <li>
              اختر «إضافة إلى الشاشة الرئيسية» <SquarePlus className="inline h-4 w-4 align-[-2px]" aria-hidden="true" />.
            </li>
            <li>افتح «رجال الأمة» من أيقونته على الشاشة، وارجع إلى هذه الصفحة لتفعيل الإشعارات.</li>
          </ol>
        </Card>
      );

    case 'denied':
      return (
        <Card icon={<BellOff className="h-5 w-5" />} title="الإشعارات محظورة لهذا الموقع">
          اسمح بها من إعدادات المتصفح (رمز القفل بجانب العنوان ← الأذونات ← الإشعارات)، أو من إعدادات الهاتف إن كان التطبيق
          مثبّتاً (على الآيفون: الإعدادات ← الإشعارات ← رجال الأمة)، ثم ارجع إلى هذه الصفحة.
        </Card>
      );

    case 'unsupported':
      return (
        <Card icon={<BellOff className="h-5 w-5" />} title="هذا المتصفح لا يدعم الإشعارات">
          جرّب كروم أو سفاري أو فايرفوكس بإصدار حديث. على الآيفون يلزم iOS ‏16.4 أو أحدث. ستبقى إشعاراتك تظهر هنا في الموقع.
        </Card>
      );

    case 'unavailable':
      // Members see nothing; an admin is told why, so a missing server setting doesn't go unnoticed.
      return user?.role === 'admin' ? (
        <Card icon={<AlertTriangle className="h-5 w-5 text-warn" />} title="إشعارات الهاتف غير مفعّلة على الخادم">
          أضف المتغيرين <code dir="ltr">VAPID_PUBLIC_KEY</code> و<code dir="ltr">VAPID_PRIVATE_KEY</code> في إعدادات الخادم (Render). هذه الرسالة
          تظهر للمشرفين فقط.
        </Card>
      ) : null;
  }
}
