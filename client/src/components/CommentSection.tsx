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
    <div key={c.id} className={isReply ? 'mt-1 border-r-2 border-accent-fill pr-4' : 'border-b border-line py-4'}>
      <div className={isReply ? 'py-2' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-extrabold text-accent">
              {c.authorName.charAt(0)}
            </span>
            <div className="leading-tight">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-display text-[15px] text-fg">{c.authorName}</p>
                {postAuthorId && c.authorId === postAuthorId && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn border border-warn/20">
                    <PenTool className="h-2.5 w-2.5" />
                    كاتب المنشور
                  </span>
                )}
                {c.authorRole === 'admin' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent border border-accent/20">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    مشرف
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{timeAgo(c.createdAt)}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {canEdit(c) && (
              <button
                onClick={() => startEdit(c)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-accent"
                aria-label="تعديل"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete(c) && (
              <button
                onClick={() => setDeleteTargetId(c.id)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
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
                  editContent.length > 1800 ? 'font-bold text-danger' : 'text-muted'
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
          <p className="mt-2 whitespace-pre-line text-[16px] leading-[1.9] text-fg-2">{c.content}</p>
        )}

        {!isReply && user && editingId !== c.id && (
          <button
            onClick={() => {
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyContent('');
            }}
            className="mt-1 inline-flex min-h-10 items-center gap-1 font-display text-sm text-accent hover:text-accent-strong"
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
                replyContent.length > 1800 ? 'font-bold text-danger' : 'text-muted'
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
    <section aria-label="التعليقات">
      <h2 className="mb-4 flex items-center gap-2 font-display text-[22px] font-semibold">
        <MessageSquare className="h-5 w-5 text-accent" aria-hidden="true" />
        التعليقات ({comments.length})
      </h2>

      {error && (
        <p className="mb-3 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
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
                  ? 'font-bold text-danger'
                  : newContent.length > 1500
                  ? 'text-warn'
                  : 'text-muted'
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
        <div className="mb-6 rounded-sm border border-line bg-surface px-4 py-3 text-fg-2">
          <Link to="/login" className="font-extrabold underline underline-offset-2 text-accent">
            سجّل الدخول
          </Link>{' '}
          لتتمكن من التعليق والرد
        </div>
      )}

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا توجد تعليقات بعد — كن أول من يشارك</p>
      ) : (
        <div>{tree.topLevel.map((c) => renderComment(c, false))}</div>
      )}

      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDeleteTargetId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف التعليق"
        >
          <div
            className="card max-w-sm w-full p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-fg">حذف التعليق</h4>
            <p className="mt-2 text-sm text-muted">
              هل أنت متأكد من رغبتك في حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="mt-5 flex gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => confirmDelete(deleteTargetId)}
                disabled={busy}
                className="btn-danger"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 font-display text-sm text-canvas shadow-xl">
          <Check className="h-4 w-4" />
          <span>{toast}</span>
        </div>
      )}
    </section>
  );
}
