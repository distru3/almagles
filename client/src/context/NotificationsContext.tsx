import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { NotificationItem, NotificationsResponse } from '../lib/types';
import { notificationLink } from '../lib/notifications';
import { disablePush, enablePush, getPushState, registerServiceWorker } from '../lib/push';
import type { PushState } from '../lib/push';
import { useAuth } from './AuthContext';

/** How often an open tab asks whether anything new arrived (push makes it instant where it's on). */
const POLL_MS = 60_000;

interface NotificationsContextValue {
  unreadCount: number;
  items: NotificationItem[];
  hasMore: boolean;
  loading: boolean;
  /** True once the list has been fetched at least once. */
  loaded: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Mark these as read, or everything when no ids are given. */
  markRead: (ids?: string[]) => Promise<void>;
  /** Open a notification: mark it read and go to its post. */
  open: (n: NotificationItem) => void;
  /** Phone/desktop popups on this device. */
  pushState: PushState;
  pushBusy: boolean;
  /** Must be called directly from a tap or click (no await before it): it shows the browser's permission prompt. */
  turnOnPush: () => Promise<void>;
  turnOffPush: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** The app icon's number on phones and desktops that support it (installed PWA). */
function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => undefined);
    else nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* not supported */
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);

  const unreadRef = useRef(0);
  const userId = user?.id ?? null;

  const applyCount = (count: number) => {
    unreadRef.current = count;
    setUnreadCount(count);
  };

  const markRead = useCallback(async (ids?: string[]) => {
    const target = ids ? new Set(ids) : null;
    setItems((list) => list.map((n) => (!target || target.has(n.id) ? { ...n, read: true } : n)));
    try {
      const res = await api<{ unreadCount: number }>('/notifications/read', { method: 'POST', body: ids ? { ids } : {} });
      applyCount(res.unreadCount);
    } catch {
      /* the next poll brings the real count back */
    }
  }, []);

  const open = useCallback(
    (n: NotificationItem) => {
      if (!n.read) markRead([n.id]);
      navigate(notificationLink(n));
    },
    [markRead, navigate],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<NotificationsResponse>('/notifications');
      setItems(res.notifications);
      setNextCursor(res.nextCursor);
      applyCount(res.unreadCount);
      setLoaded(true);
    } catch {
      /* keep what we had */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const res = await api<NotificationsResponse>(`/notifications?cursor=${encodeURIComponent(nextCursor)}`);
      setItems((list) => [...list, ...res.notifications.filter((n) => !list.some((x) => x.id === n.id))]);
      setNextCursor(res.nextCursor);
      applyCount(res.unreadCount);
    } catch {
      /* the button stays, so it can be tried again */
    } finally {
      setLoading(false);
    }
  }, [nextCursor]);

  const runPush = useCallback(async (action: () => Promise<PushState>) => {
    setPushBusy(true);
    try {
      setPushState(await action());
    } catch {
      setPushState(await getPushState().catch(() => 'unsupported' as const));
    } finally {
      setPushBusy(false);
    }
  }, []);
  const turnOnPush = useCallback(() => runPush(enablePush), [runPush]);
  const turnOffPush = useCallback(() => runPush(disablePush), [runPush]);

  // The service worker is what shows popups when the site is closed.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Start fresh for every account, and stay empty when logged out.
  useEffect(() => {
    applyCount(0);
    setItems([]);
    setNextCursor(null);
    setLoaded(false);
    if (!userId) return;
    reload();
    // Also re-links this device to the account if popups were already on here.
    getPushState().then(setPushState, () => undefined);
  }, [userId, reload]);

  // Ask for the count now and then, and whenever the tab comes back; fetch the list only when it changed.
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    const check = async () => {
      try {
        const { count } = await api<{ count: number }>('/notifications/unread-count');
        if (!stopped && count !== unreadRef.current) await reload();
      } catch {
        /* offline or logged out; try again next time */
      }
    };
    const onVisible = () => {
      if (document.hidden) return;
      check();
      // Permission can change in the browser's settings while the tab is in the background.
      getPushState().then(setPushState, () => undefined);
    };
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, reload]);

  // Messages from the service worker: a push arrived, or its popup was tapped while the site was open.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === 'notification') reload();
      if (data?.type === 'open' && data.url) {
        const url = new URL(data.url, window.location.origin);
        if (url.origin === window.location.origin) navigate(url.pathname + url.search + url.hash);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [reload, navigate]);

  // A popup's link carries ?n=<id>: mark that one read, then tidy the address.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('n');
    if (!id || !userId) return;
    markRead([id]);
    params.delete('n');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true });
  }, [location.search, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAppBadge(userId ? unreadCount : 0);
  }, [unreadCount, userId]);

  return (
    <NotificationsContext.Provider
      value={{
        unreadCount,
        items,
        hasMore: nextCursor !== null,
        loading,
        loaded,
        reload,
        loadMore,
        markRead,
        open,
        pushState,
        pushBusy,
        turnOnPush,
        turnOffPush,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
