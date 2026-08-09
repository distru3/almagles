import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Send, Pencil, Trash2, Reply, X, Check } from 'lucide-react';
import type { CommentItem } from '../lib/types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface Props {
  postId: string;
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

export default function CommentSection({ postId, comments, onChanged }: Props) {
  const { user } = useAuth();
  const [newContent, setNewContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const content = (replyingTo ? replyContent : newContent).trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/comments/${postId}`, {
        method: 'POST',
        body: { content, ...(replyingTo ? { parentId: replyingTo } : {}) },
      });
      setNewContent('');
      setReplyContent('');
      setReplyingTo(null);
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
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تعديل التعليق');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذا التعليق؟')) return;
    setBusy(true);
    try {
      await api(`/comments/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف التعليق');
    } finally {
      setBusy(false);
    }
  };

  const canModify = (c: CommentItem) => user && (user.id === c.authorId || user.role === 'admin');

  const renderComment = (c: CommentItem, isReply: boolean) => (
    <div key={c.id} className={isReply ? 'mr-8 border-r-2 border-brand-100 pr-3 sm:mr-12' : ''}>
      <div className="card !rounded-xl p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700">
              {c.authorName.charAt(0)}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-brand-950">{c.authorName}</p>
              <p className="text-[11px] text-stone-400">{timeAgo(c.createdAt)}</p>
            </div>
          </div>
          {canModify(c) && (
            <div className="flex gap-1.5">
              <button
                onClick={() => startEdit(c)}
                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-brand-50 hover:text-brand-700"
                aria-label="تعديل"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(c.id)}
                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label="حذف"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {editingId === c.id ? (
          <div className="mt-2.5 flex gap-2">
            <input
              className="input !py-1.5 text-sm"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={2000}
              autoFocus
            />
            <button onClick={() => saveEdit(c.id)} className="btn-primary !px-3 !py-1.5" disabled={busy}>
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setEditingId(null)} className="btn-outline !px-3 !py-1.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-700">{c.content}</p>
        )}

        {!isReply && user && editingId !== c.id && (
          <button
            onClick={() => {
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyContent('');
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-800"
          >
            <Reply className="h-3.5 w-3.5" />
            رد
          </button>
        )}
      </div>

      {replyingTo === c.id && (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <input
            className="input !py-1.5 text-sm"
            placeholder="اكتب ردّك…"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            maxLength={2000}
            autoFocus
          />
          <button type="submit" className="btn-primary !px-3 !py-1.5" disabled={busy}>
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}

      {(tree.byParent[c.id] ?? []).map((reply) => renderComment(reply, true))}
    </div>
  );

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-brand-700" />
        <h3 className="font-display text-lg font-extrabold text-brand-950">
          التعليقات ({comments.length})
        </h3>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {user ? (
        <form onSubmit={submit} className="mb-6 flex gap-2">
          <input
            className="input"
            placeholder="اكتب تعليقك…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            maxLength={2000}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={busy || !newContent.trim()}>
            <Send className="h-4 w-4" />
            نشر
          </button>
        </form>
      ) : (
        <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Link to="/login" className="font-extrabold underline underline-offset-2">
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
    </section>
  );
}