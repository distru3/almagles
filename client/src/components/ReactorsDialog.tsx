import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import Avatar from './Avatar';
import Spinner from './Spinner';
import { REACTIONS, arNumber, type ReactionType } from './reactions';

interface Reactor {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  type: ReactionType;
  reactedAt: string;
}

interface Page {
  users: Reactor[];
  nextCursor: string | null;
  counts?: Record<ReactionType, number>;
}

const ROLE_BADGE: Record<string, string> = { writer: 'كاتب', admin: 'مشرف' };
const ICONS = Object.fromEntries(REACTIONS.map((r) => [r.key, r])) as Record<ReactionType, (typeof REACTIONS)[number]>;

/**
 * The people who reacted to a post or comment, with a tab per reaction.
 * `endpoint` is the reactions URL, e.g. `/posts/:id/reactions`.
 */
export default function ReactorsDialog({ endpoint, onClose }: { endpoint: string; onClose: () => void }) {
  const [tab, setTab] = useState<ReactionType | 'all'>('all');
  const [users, setUsers] = useState<Reactor[]>([]);
  const [counts, setCounts] = useState<Record<ReactionType, number> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // A quick tab switch must not let the slower, older response win.
  const request = useRef(0);

  const load = async (type: ReactionType | 'all', after: string | null) => {
    const id = ++request.current;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    if (after) params.set('cursor', after);
    try {
      const query = params.toString();
      const page = await api<Page>(`${endpoint}/users${query ? `?${query}` : ''}`);
      if (id !== request.current) return;
      setUsers((prev) => (after ? [...prev, ...page.users] : page.users));
      setCursor(page.nextCursor);
      if (page.counts) setCounts(page.counts);
    } catch {
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    setUsers([]);
    setCursor(null);
    void load(tab, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, endpoint]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  const total = counts ? counts.like + counts.love + counts.insight : 0;
  const tabClass = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 font-display text-sm transition ${
      active ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-fg'
    }`;

  // Portaled to <body>, but React events still bubble to the opener
  // (a feed card opens its post on click), so they stop here.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onAuxClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactors-title"
    >
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="reactors-title" className="font-display text-base font-bold text-fg">
            التفاعلات
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex overflow-x-auto border-b border-line px-2" role="tablist" aria-label="نوع التفاعل">
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')} className={tabClass(tab === 'all')}>
            الكل{counts ? ` ${arNumber.format(total)}` : ''}
          </button>
          {REACTIONS.filter(({ key }) => (counts?.[key] ?? 0) > 0).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-label={`${label} (${arNumber.format(counts![key])})`}
              onClick={() => setTab(key)}
              className={tabClass(tab === key)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {arNumber.format(counts![key])}
            </button>
          ))}
        </div>

        <div className="min-h-40 overflow-y-auto" role="tabpanel">
          {users.length > 0 && (
            <ul className="divide-y divide-line">
              {users.map((u) => {
                const { icon: Icon, label } = ICONS[u.type] ?? REACTIONS[0];
                const badge = ROLE_BADGE[u.role];
                return (
                  <li key={u.id}>
                    <Link to={`/u/${u.id}`} onClick={onClose} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2">
                      <span className="relative shrink-0">
                        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        <span
                          className="absolute -bottom-1 -end-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface bg-accent-fill text-on-accent"
                          title={label}
                        >
                          <Icon className="h-2.5 w-2.5 fill-current" aria-label={label} />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 truncate font-display text-[15px] text-fg">{u.name}</span>
                      {badge && <span className="shrink-0 rounded-full bg-accent-soft px-2 text-[11px] text-accent">{badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              تعذّر تحميل التفاعلات.{' '}
              <button type="button" onClick={() => load(tab, cursor)} className="text-accent hover:text-accent-strong">
                إعادة المحاولة
              </button>
            </div>
          ) : users.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">لا توجد تفاعلات بعد.</p>
          ) : cursor ? (
            <div className="p-3 text-center">
              <button type="button" onClick={() => load(tab, cursor)} className="btn-outline !px-4 !py-1.5 text-sm">
                عرض المزيد
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
