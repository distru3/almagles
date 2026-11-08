import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Smartphone } from 'lucide-react';
import { useNotifications } from '../context/NotificationsContext';
import NotificationList from './NotificationList';
import Spinner from './Spinner';

/** How many show in the dropdown; the rest are on /notifications. */
const PREVIEW = 8;

export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-white ring-2 ring-canvas">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function NotificationBell({ className = '' }: { className?: string }) {
  const { unreadCount, items, loaded, loading, reload, markRead, open, pushState } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    reload();
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = unreadCount ? `الإشعارات، ${unreadCount} غير مقروءة` : 'الإشعارات';

  return (
    <div ref={wrapper} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition hover:bg-surface-2 hover:text-fg"
        aria-label={label}
        title="الإشعارات"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        <UnreadBadge count={unreadCount} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="الإشعارات"
          className="fixed inset-x-3 top-[4.75rem] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[380px]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-display text-base font-bold text-fg">الإشعارات</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead()}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-accent transition hover:bg-accent-soft"
              >
                <CheckCheck className="h-4 w-4" />
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-[min(65vh,480px)] overflow-y-auto">
            {!loaded && loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : items.length ? (
              <NotificationList
                compact
                items={items.slice(0, PREVIEW)}
                onOpen={(n) => {
                  setIsOpen(false);
                  open(n);
                }}
              />
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted">لا توجد إشعارات بعد</p>
            )}
          </div>

          {(pushState === 'off' || pushState === 'needs-install') && (
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 border-t border-line bg-accent-soft/40 px-4 py-3 text-sm text-fg-2 transition hover:bg-accent-soft"
            >
              <Smartphone className="h-4 w-4 shrink-0 text-accent" />
              <span>فعّل الإشعارات لتصلك على هاتفك فوراً</span>
            </Link>
          )}

          <Link
            to="/notifications"
            onClick={() => setIsOpen(false)}
            className="block border-t border-line px-4 py-3 text-center font-display text-sm font-semibold text-accent transition hover:bg-surface-2"
          >
            عرض كل الإشعارات
          </Link>
        </div>
      )}
    </div>
  );
}
