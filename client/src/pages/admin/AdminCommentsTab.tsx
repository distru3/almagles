import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, MessageSquare, MessagesSquare } from 'lucide-react';
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
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-black text-brand-950">إدارة التعليقات</h2>
      <p className="text-sm text-stone-500">أحدث تعليقات الزوار — يمكنك حذف أي تعليق</p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={MessagesSquare} title="لا توجد تعليقات" description="عندما يشارك الزوار ستظهر تعليقاتهم هنا" />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-brand-100 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700">
                    {c.authorName.charAt(0)}
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-extrabold text-brand-950">
                      {c.authorName}
                      {c.parentId && <span className="mr-1.5 text-xs font-medium text-stone-400">(رد)</span>}
                    </p>
                    <p className="text-[11px] text-stone-400">{timeAgoFull(c.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/post/${c.postId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-800"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="max-w-40 truncate">{c.postTitle}</span>
                  </Link>
                  <button onClick={() => remove(c)} className="btn-danger !px-2.5 !py-1.5" aria-label="حذف">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm leading-7 text-stone-700">{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}