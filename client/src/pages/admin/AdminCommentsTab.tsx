import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, MessageSquare, MessagesSquare, Search, ExternalLink, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { CommentItem } from '../../lib/types';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';

function timeAgoFull(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `منذ ${Math.max(1, Math.floor(diff / 60000))} دقيقة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

export default function AdminCommentsTab() {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterReply, setFilterReply] = useState<'all' | 'direct' | 'reply'>('all');

  const load = async () => {
    try {
      const res = await api<{ comments: CommentItem[] }>('/comments');
      setComments(res.comments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (comment: CommentItem) => {
    if (!window.confirm('حذف هذا التعليق؟')) return;
    try {
      await api(`/comments/${comment.id}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  const filtered = comments.filter((c) => {
    const matchesSearch = `${c.authorName} ${c.content} ${c.postTitle || ''}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (filterReply === 'direct') return !c.parentId;
    if (filterReply === 'reply') return Boolean(c.parentId);
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-fg">
            إدارة التعليقات
          </h2>
          <p className="text-xs text-muted mt-0.5">
            عرض {filtered.length} من أصل {comments.length} تعليق
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            className="input !py-2 pr-9 pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المعلق أو نص التعليق أو عنوان المنشور…"
            aria-label="البحث في التعليقات"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterReply('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterReply === 'all'
                ? 'bg-accent-fill text-on-accent'
                : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
            }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setFilterReply('direct')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterReply === 'direct'
                ? 'bg-accent-fill text-on-accent'
                : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
            }`}
          >
            تعليقات رئيسية
          </button>
          <button
            type="button"
            onClick={() => setFilterReply('reply')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              filterReply === 'reply'
                ? 'bg-accent-fill text-on-accent'
                : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
            }`}
          >
            ردود
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-danger bg-danger-soft px-3.5 py-2 text-xs font-bold text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="لا توجد تعليقات بعد"
          description="عندما يشارك الزوار تفاعلاتهم ستظهر تعليقاتهم هنا لإدارتها"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="لم يتم العثور على نتائج"
          description="جرّب كلمة بحث أخرى أو امسح شريط البحث"
          action={
            <button
              onClick={() => {
                setSearch('');
                setFilterReply('all');
              }}
              className="btn-outline mt-2"
            >
              عرض جميع التعليقات
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-line bg-surface p-4 shadow-2xs transition hover:border-line-strong"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-black text-fg">
                    {c.authorName.charAt(0)}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-black text-fg">
                        {c.authorName}
                      </p>
                      {c.parentId && (
                        <span className="rounded-md bg-surface-2 px-1.5 py-0.2 text-[10px] font-bold text-muted">
                          رد
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted">
                      {timeAgoFull(c.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/post/${c.postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-fg"
                    title="فتح المنشور في الموقع"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[180px] sm:max-w-xs truncate">
                      {c.postTitle || 'عرض المنشور'}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="btn-danger !px-2.5 !py-1 text-xs inline-flex items-center gap-1"
                    aria-label="حذف"
                    title="حذف هذا التعليق"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">حذف</span>
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs leading-6 text-fg">
                {c.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}