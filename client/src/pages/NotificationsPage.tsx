import { useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '../context/NotificationsContext';
import NotificationList from '../components/NotificationList';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import PushSettings from '../components/PushSettings';

export default function NotificationsPage() {
  const { items, unreadCount, loaded, loading, hasMore, reload, loadMore, markRead, open } = useNotifications();

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const previous = document.title;
    document.title = 'الإشعارات — رجال الأمة';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="container-site max-w-3xl py-8">
      <div className="page-header flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-fill text-on-accent">
            <Bell className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black text-fg">الإشعارات</h1>
            <p className="text-sm text-muted">
              {unreadCount ? `${unreadCount} غير مقروءة` : 'لا جديد'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={() => markRead()} className="btn-outline !min-h-10 !text-sm">
            <CheckCheck className="h-4 w-4" />
            تعليم الكل كمقروء
          </button>
        )}
      </div>

      <PushSettings />

      {!loaded ? (
        <Spinner full />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="لا توجد إشعارات بعد"
          description="ستظهر هنا الردود على تعليقاتك، والتعليقات والتفاعلات على منشوراتك، والمنشورات الجديدة."
        />
      ) : (
        <div className="card overflow-hidden">
          <NotificationList items={items} onOpen={open} />
          {hasMore && (
            <div className="border-t border-line p-3 text-center">
              <button type="button" onClick={loadMore} disabled={loading} className="btn-outline !min-h-10 !text-sm">
                {loading ? 'جارٍ التحميل…' : 'عرض المزيد'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
