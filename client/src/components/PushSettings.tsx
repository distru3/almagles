import { BellOff, BellRing, Download, Share, SquarePlus, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { useInstallPrompt } from '../lib/install';

function Card({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
        <div>
          <p className="font-display font-bold text-fg">{title}</p>
          {children && <div className="mt-1 text-sm leading-7 text-fg-2">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** Turning phone/desktop popups on or off for this device, with the steps each platform needs. */
export default function PushSettings() {
  const { pushState, pushBusy, turnOnPush, turnOffPush } = useNotifications();
  const { install } = useInstallPrompt();

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
              <button type="button" onClick={turnOffPush} disabled={pushBusy} className="btn-outline !min-h-10 !text-sm">
                <BellOff className="h-4 w-4" />
                إيقاف
              </button>
            </>
          }
        >
          تصلك الإشعارات فوراً حتى والموقع مغلق.
        </Card>
      );

    case 'off':
      return (
        <Card
          icon={<Smartphone className="h-5 w-5" />}
          title="إشعارات فورية على هاتفك"
          action={
            <>
              {installButton}
              <button type="button" onClick={turnOnPush} disabled={pushBusy} className="btn-primary !min-h-10 !text-sm">
                <BellRing className="h-4 w-4" />
                {pushBusy ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات'}
              </button>
            </>
          }
        >
          تظهر لك الردود والتعليقات والمنشورات الجديدة كإشعار على الهاتف، حتى والموقع مغلق.
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
          اسمح بها من إعدادات المتصفح (رمز القفل بجانب العنوان ← الأذونات ← الإشعارات)، أو من إعدادات التطبيق في الهاتف إن
          كان مثبّتاً، ثم ارجع إلى هذه الصفحة.
        </Card>
      );

    case 'unsupported':
      return (
        <Card icon={<BellOff className="h-5 w-5" />} title="هذا المتصفح لا يدعم الإشعارات">
          جرّب كروم أو سفاري أو فايرفوكس بإصدار حديث. ستبقى إشعاراتك تظهر هنا في الموقع.
        </Card>
      );

    case 'unavailable':
      return null;
  }
}
