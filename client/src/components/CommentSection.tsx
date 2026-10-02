import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Send, Pencil, Trash2, Reply, X, Check, ShieldCheck, PenTool } from 'lucide-react';
import type { CommentItem } from '../lib/types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface Props {
  postId: string;
  postCategoryId?: string;
  postAuthorId?: string;
  comments: CommentItem[];
  onChanged: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

export default function CommentSection({ postId, postCategoryId, postAuthorId, comments, onChanged }: Props) {
  const { user } = useAuth();
  const [newContent, setNewContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const tree = useMemo(() => {
    const topLevel: CommentItem[] = [];
    const byParent: Record<string, CommentItem[]> = {};
    for (const c of comments) {
      if (!c.parentId) topLevel.push(c);
      else (byParent[c.parentId] ??= []).push(c);
    }
    return { topLevel, byParent };
  }, [comments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isReply = !!replyingTo;
    const content = (isReply ? replyContent : newContent).trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/comments/${postId}`, {
        method: 'POST',
        body: { content, ...(replyingTo ? { parentId: replyingTo } : {}) },
      });
      if (isReply) {
        setReplyContent('');
        setReplyingTo(null);
      } else {
        setNewContent('');
      }
      showToast('تم إرسال التعليق بنجاح');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال التعليق');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: CommentItem) => {
    setEditingId(c.id);
    setEditContent(c.content);
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/comments/${id}`, { method: 'PUT', body: { content: editContent.trim() } });
      setEditingId(null);
      showToast('تم تعديل التعليق بنجاح');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تعديل التعليق');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/comments/${id}`, { method: 'DELETE' });
      setDeleteTargetId(null);
      showToast('تم حذف التعليق');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف التعليق');
    } finally {
      setBusy(false);
    }
  };

  const canEdit = (c: CommentItem) => user && user.id === c.authorId;
  const canDelete = (c: CommentItem) =>
    user &&
    (user.id === c.authorId ||
      user.role === 'admin' ||
      (!!postCategoryId && user.managedCategoryIds.includes(postCategoryId)));

  const renderComment = (c: CommentItem, isReply: boolean) => (
    <div key={c.id} className={isReply ? 'mr-8 border-r-2 border-brand-100 pr-3 sm:mr-12' : ''}>
      <div className="card card-editorial !rounded-xl p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700 dark:bg-stone-800 dark:text-brand-300">
              {c.authorName.charAt(0)}
            </span>
            <div className="leading-tight">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-extrabold text-brand-950 dark:text-stone-100">{c.authorName}</p>
                {postAuthorId && c.authorId === postAuthorId && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                    <PenTool className="h-2.5 w-2.5" />
                    كاتب المنشور
                  </span>
                )}
                {c.authorRole === 'admin' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:text-brand-400 border border-brand-500/20">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    مشرف
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-400 mt-0.5">{timeAgo(c.createdAt)}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {canEdit(c) && (
              <button
                onClick={() => startEdit(c)}
                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-stone-800 dark:hover:text-brand-400"
                aria-label="تعديل"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete(c) && (
              <button
                onClick={() => setDeleteTargetId(c.id)}
                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                aria-label="حذف"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {editingId === c.id ? (
          <div className="mt-2.5 space-y-2">
            <textarea
              className="input min-h-[64px] w-full resize-y py-2 text-sm leading-6"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={2000}
              rows={2}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] ${
                  editContent.length > 1800 ? 'font-bold text-red-500' : 'text-stone-400'
                }`}
              >
                {editContent.length} / 2000
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => saveEdit(c.id)}
                  className="btn-primary !px-3 !py-1 text-xs"
                  disabled={busy || !editContent.trim()}
                >
                  <Check className="h-3.5 w-3.5" />
                  حفظ
                </button>
                <button onClick={() => setEditingId(null)} className="btn-outline !px-3 !py-1 text-xs">
                  <X className="h-3.5 w-3.5" />
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-700 dark:text-stone-300">{c.content}</p>
        )}

        {!isReply && user && editingId !== c.id && (
          <button
            onClick={() => {
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyContent('');
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Reply className="h-3.5 w-3.5" />
            رد
          </button>
        )}
      </div>

      {replyingTo === c.id && (
        <form onSubmit={submit} className="mt-2.5 space-y-2">
          <textarea
            className="input min-h-[64px] w-full resize-y py-2 text-sm leading-6"
            placeholder="اكتب ردّك…"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            maxLength={2000}
            rows={2}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] ${
                replyContent.length > 1800 ? 'font-bold text-red-500' : 'text-stone-400'
              }`}
            >
              {replyContent.length} / 2000
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent('');
                }}
                className="btn-outline !py-1 !px-2.5 text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="btn-primary !py-1 !px-3 text-xs"
                disabled={busy || !replyContent.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                إرسال الرد
              </button>
            </div>
          </div>
        </form>
      )}

      {(tree.byParent[c.id] ?? []).map((reply) => renderComment(reply, true))}
    </div>
  );

  return (
    <section className="card card-editorial p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-brand-700 dark:text-brand-400" />
        <h3 className="font-display text-lg font-extrabold text-brand-950 dark:text-stone-100">
          التعليقات ({comments.length})
        </h3>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      {user ? (
        <form onSubmit={submit} className="mb-6 space-y-2">
          <textarea
            className="input min-h-[88px] w-full resize-y py-2.5 text-sm leading-6"
            placeholder="اكتب تعليقك أو استفسارك هنا…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            maxLength={2000}
            rows={3}
          />
          <div className="flex items-center justify-between">
            <span
              className={`text-xs ${
                newContent.length > 1800
                  ? 'font-bold text-red-500'
                  : newContent.length > 1500
                  ? 'text-amber-500'
                  : 'text-stone-400'
              }`}
            >
              {newContent.length} / 2000
            </span>
            <button
              type="submit"
              className="btn-primary shrink-0"
              disabled={busy || !newContent.trim()}
            >
              <Send className="h-4 w-4" />
              نشر التعليق
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-stone-800 dark:bg-stone-800/60 dark:text-stone-300">
          <Link to="/login" className="font-extrabold underline underline-offset-2 text-brand-700 dark:text-brand-400">
            سجّل الدخول
          </Link>{' '}
          لتتمكن من التعليق والرد
        </div>
      )}

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-400">لا توجد تعليقات بعد — كن أول من يشارك</p>
      ) : (
        <div className="space-y-3">{tree.topLevel.map((c) => renderComment(c, false))}</div>
      )}

      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setDeleteTargetId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف التعليق"
        >
          <div
            className="card card-editorial max-w-sm w-full p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <Trash2 className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-brand-950 dark:text-stone-100">حذف التعليق</h4>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              هل أنت متأكد من رغبتك في حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="mt-5 flex gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => confirmDelete(deleteTargetId)}
                disabled={busy}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'جارِ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                disabled={busy}
                className="btn-outline !py-2 !px-4 text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-bold text-white shadow-xl animate-fade-in dark:bg-stone-800 dark:border dark:border-stone-700">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </section>
  );
}
