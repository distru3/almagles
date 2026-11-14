import { useEffect, useId, useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Task, TaskRepeat } from '../../lib/types';
import Spinner from '../Spinner';
import { REPEAT_LABELS } from './TaskChecklist';

interface Draft {
  title: string;
  description: string;
  linkUrl: string;
  repeat: TaskRepeat;
}
const emptyDraft: Draft = { title: '', description: '', linkUrl: '', repeat: 'daily' };
const draftOf = (t: Task): Draft => ({ title: t.title, description: t.description ?? '', linkUrl: t.linkUrl ?? '', repeat: t.repeat });
const payloadOf = (d: Draft) => ({
  title: d.title.trim(),
  description: d.description.trim() || null,
  linkUrl: d.linkUrl.trim() || null,
  repeat: d.repeat,
});

/** The add / edit form. Saves only on «حفظ». */
function TaskForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const uid = useId();

  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.title.trim()) {
          setError('عنوان المهمة مطلوب');
          return;
        }
        setBusy(true);
        const err = await onSubmit(draft);
        setBusy(false);
        setError(err);
      }}
    >
      <div>
        <label className="label" htmlFor={`task-title-${uid}`}>
          المهمة
        </label>
        <input
          id={`task-title-${uid}`}
          className="input"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="مثال: حفظ آيات من سورة الأنعام"
          maxLength={200}
          autoFocus
        />
      </div>
      <div>
        <span className="label">التكرار</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="التكرار">
          {(['daily', 'weekly', 'once'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={draft.repeat === r}
              onClick={() => set({ repeat: r })}
              className={`min-h-10 rounded-full border px-4 font-display text-sm transition ${
                draft.repeat === r ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-fg-2 hover:border-accent'
              }`}
            >
              {REPEAT_LABELS[r]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          {draft.repeat === 'daily'
            ? 'تعود غير منجزة كل يوم — مثل قيام الليل.'
            : draft.repeat === 'weekly'
              ? 'تعود غير منجزة كل سبت — مثل حفظ مقطع الأسبوع.'
              : 'تبقى منجزة بعد أن يضع العضو علامتها.'}
        </p>
      </div>
      <div>
        <label className="label" htmlFor={`task-desc-${uid}`}>
          تفاصيل <span className="font-normal text-muted">(اختياري)</span>
        </label>
        <textarea
          id={`task-desc-${uid}`}
          className="input resize-y"
          rows={2}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="مثال: من الآية 1 إلى 20"
          maxLength={1000}
        />
      </div>
      <div>
        <label className="label" htmlFor={`task-link-${uid}`}>
          رابط <span className="font-normal text-muted">(اختياري)</span>
        </label>
        <input
          id={`task-link-${uid}`}
          className="input"
          dir="ltr"
          value={draft.linkUrl}
          onChange={(e) => set({ linkUrl: e.target.value })}
          placeholder="https://youtu.be/…"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-outline !min-h-10 !px-4 !text-sm" disabled={busy}>
            إلغاء
          </button>
        )}
        <button type="submit" className="btn-primary !min-h-10 !px-4 !text-sm" disabled={busy}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {busy ? 'جارٍ الحفظ…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Admins and schedule managers: add, edit, archive and delete tasks. */
export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    api<{ tasks: Task[] }>('/tasks/manage')
      .then((res) => setTasks(res.tasks))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'تعذّر تحميل المهام'));
  }, []);

  const message = (err: unknown) => (err instanceof ApiError ? err.message : 'تعذّر الحفظ — تحقق من الاتصال ثم حاول مرة أخرى');
  const replace = (task: Task) => setTasks((list) => list?.map((t) => (t.id === task.id ? task : t)) ?? list);

  const create = async (d: Draft) => {
    try {
      const res = await api<{ task: Task }>('/tasks', { method: 'POST', body: payloadOf(d) });
      setTasks((list) => [...(list ?? []).filter((t) => t.active), res.task, ...(list ?? []).filter((t) => !t.active)]);
      setAdding(false);
      return null;
    } catch (err) {
      return message(err);
    }
  };

  const update = async (task: Task, d: Draft) => {
    try {
      replace((await api<{ task: Task }>(`/tasks/${task.id}`, { method: 'PUT', body: payloadOf(d) })).task);
      setEditing(null);
      return null;
    } catch (err) {
      return message(err);
    }
  };

  const setActive = async (task: Task, active: boolean) => {
    setRowError(null);
    try {
      replace((await api<{ task: Task }>(`/tasks/${task.id}`, { method: 'PUT', body: { active } })).task);
    } catch (err) {
      setRowError({ id: task.id, message: message(err) });
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(`حذف مهمة «${task.title}» وكل سجلّ إنجازها؟\nلإخفائها مع الاحتفاظ بالسجلّ استخدم «أرشفة».`)) return;
    setRowError(null);
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      setTasks((list) => list?.filter((t) => t.id !== task.id) ?? list);
    } catch (err) {
      setRowError({ id: task.id, message: message(err) });
    }
  };

  if (loadError) return <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{loadError}</p>;
  if (!tasks) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const active = tasks.filter((t) => t.active);
  const archived = tasks.filter((t) => !t.active);

  const item = (task: Task) => (
    <li key={task.id} className="py-3">
      {editing === task.id ? (
        <TaskForm initial={draftOf(task)} submitLabel="حفظ" onSubmit={(d) => update(task, d)} onCancel={() => setEditing(null)} />
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-display text-[16px] ${task.active ? 'text-fg' : 'text-muted'}`}>{task.title}</p>
            <p className="text-xs text-muted">
              {REPEAT_LABELS[task.repeat]}
              {task.description && ` · ${task.description.slice(0, 80)}${task.description.length > 80 ? '…' : ''}`}
              {task.linkUrl && ' · فيها رابط'}
            </p>
            {rowError?.id === task.id && <p className="mt-1 text-sm text-danger">{rowError.message}</p>}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setEditing(task.id)} aria-label={`تعديل ${task.title}`} title="تعديل" className="flex h-10 w-10 items-center justify-center rounded border border-line text-fg-2 hover:border-accent hover:text-accent">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void setActive(task, !task.active)}
              aria-label={task.active ? `أرشفة ${task.title}` : `إعادة ${task.title}`}
              title={task.active ? 'أرشفة (إخفاء عن الأعضاء مع الاحتفاظ بالسجلّ)' : 'إعادة إظهارها للأعضاء'}
              className="flex h-10 w-10 items-center justify-center rounded border border-line text-fg-2 hover:border-accent hover:text-accent"
            >
              {task.active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => void remove(task)} aria-label={`حذف ${task.title}`} title="حذف" className="flex h-10 w-10 items-center justify-center rounded border border-line text-danger hover:border-danger hover:bg-danger-soft">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
          <h2 className="font-display text-[18px] font-semibold">المهام الحالية</h2>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="btn-primary !min-h-10 !px-4 !text-sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              مهمة جديدة
            </button>
          )}
        </div>
        {adding && (
          <div className="border-b border-line py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-accent">مهمة جديدة</p>
              <button type="button" onClick={() => setAdding(false)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <TaskForm initial={emptyDraft} submitLabel="إضافة المهمة" onSubmit={create} onCancel={() => setAdding(false)} />
          </div>
        )}
        {active.length === 0 && !adding ? (
          <p className="py-6 text-center text-sm text-muted">لا توجد مهام بعد — أضف أول مهمة يراها الأعضاء.</p>
        ) : (
          <ul className="divide-y divide-line">{active.map(item)}</ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
          <h2 className="border-b border-line pb-2 font-display text-[18px] font-semibold text-fg-2">
            المؤرشفة <span className="text-sm font-normal text-muted">— مخفية عن الأعضاء</span>
          </h2>
          <ul className="divide-y divide-line">{archived.map(item)}</ul>
        </section>
      )}
    </div>
  );
}
