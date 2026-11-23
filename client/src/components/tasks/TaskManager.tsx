import { useEffect, useId, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, BookOpen, Check, GraduationCap, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Task, TaskRepeat, TaskTime } from '../../lib/types';
import { fadailFor } from '../../lib/fadail';
import { REPEAT_LABELS, WEEKDAYS, scheduleSummary } from '../../lib/taskSchedule';
import Spinner from '../Spinner';
import FadlText from './FadlText';

interface Draft {
  title: string;
  description: string;
  linkUrl: string;
  repeat: TaskRepeat;
  points: number;
  startDate: string;
  endDate: string;
  weekdays: number[];
  timeWindow: TaskTime;
  startTime: string;
  endTime: string;
  fromLearning: boolean;
}
const emptyDraft: Draft = {
  title: '',
  description: '',
  linkUrl: '',
  repeat: 'daily',
  points: 10,
  startDate: '',
  endDate: '',
  weekdays: [],
  timeWindow: 'anytime',
  startTime: '',
  endTime: '',
  fromLearning: false,
};
const draftOf = (t: Task): Draft => ({
  title: t.title,
  description: t.description ?? '',
  linkUrl: t.linkUrl ?? '',
  repeat: t.repeat,
  points: t.points,
  startDate: t.startDate ?? '',
  endDate: t.endDate ?? '',
  weekdays: t.weekdays,
  timeWindow: t.timeWindow,
  startTime: t.startTime ?? '',
  endTime: t.endTime ?? '',
  fromLearning: t.fromLearning,
});
const payloadOf = (d: Draft) => ({
  title: d.title.trim(),
  description: d.description.trim() || null,
  linkUrl: d.linkUrl.trim() || null,
  repeat: d.repeat,
  points: d.points,
  startDate: d.startDate || null,
  endDate: d.endDate || null,
  weekdays: d.repeat === 'daily' ? d.weekdays : [],
  timeWindow: d.timeWindow,
  startTime: d.timeWindow === 'range' ? d.startTime || null : null,
  endTime: d.timeWindow === 'range' ? d.endTime || null : null,
  fromLearning: d.fromLearning,
});

const arNumber = new Intl.NumberFormat('ar');
const TIME_LABELS: Record<TaskTime, string> = { anytime: 'في أي وقت', range: 'وقت محدد', qiyam: 'قيام الليل (العشاء ← الفجر)' };
const POINT_PRESETS = [5, 10, 20, 30, 50];

const chip = (on: boolean) =>
  `min-h-10 rounded-full border px-4 font-display text-sm transition ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-fg-2 hover:border-accent'}`;

/** What members will see under «فضلها», matched from the dictionary in lib/fadail.ts. */
function FadlPreview({ text }: { text: string }) {
  const entries = useMemo(() => fadailFor(text), [text]);
  if (!text.trim()) return null;
  return (
    <div className="rounded-sm border border-dashed border-line-strong px-3 py-2.5 text-sm">
      <p className="flex items-center gap-1.5 font-display text-fg-2">
        <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
        {entries.length ? `سيرى الأعضاء فضل: ${entries.map((f) => f.title).join('، ')}` : 'لا يوجد فضل مطابق في القاموس — سيرون آية عامة في الأجر عند الإنجاز.'}
      </p>
      {entries[0] && <FadlText text={entries[0].texts[0]} className="mt-1.5" />}
    </div>
  );
}

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
        if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
          setError('تاريخ النهاية قبل تاريخ البداية');
          return;
        }
        if (draft.timeWindow === 'range' && (!draft.startTime || !draft.endTime)) {
          setError('حدّد وقت البداية والنهاية');
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
              className={chip(draft.repeat === r)}
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
      {draft.repeat === 'daily' && (
        <div>
          <span className="label">
            الأيام <span className="font-normal text-muted">(بلا اختيار = كل يوم)</span>
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="أيام الأسبوع">
            {WEEKDAYS.map((w) => {
              const on = draft.weekdays.includes(w.day);
              return (
                <button
                  key={w.day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ weekdays: on ? draft.weekdays.filter((d) => d !== w.day) : [...draft.weekdays, w.day] })}
                  className={`${chip(on)} !min-h-9 !px-3`}
                >
                  {w.short}
                </button>
              );
            })}
            <button type="button" onClick={() => set({ weekdays: [1, 4] })} className="min-h-9 px-2 text-sm text-accent hover:text-accent-strong">
              الاثنين والخميس
            </button>
          </div>
        </div>
      )}
      <div>
        <span className="label">الوقت</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الوقت">
          {(['anytime', 'range', 'qiyam'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={draft.timeWindow === w} onClick={() => set({ timeWindow: w })} className={chip(draft.timeWindow === w)}>
              {TIME_LABELS[w]}
            </button>
          ))}
        </div>
        {draft.timeWindow === 'range' && (
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div>
              <label className="label !text-xs" htmlFor={`task-st-${uid}`}>
                من
              </label>
              <input id={`task-st-${uid}`} type="time" className="input !h-10 !py-1" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            </div>
            <div>
              <label className="label !text-xs" htmlFor={`task-et-${uid}`}>
                إلى
              </label>
              <input id={`task-et-${uid}`} type="time" className="input !h-10 !py-1" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
            </div>
          </div>
        )}
        <p className="mt-1 text-xs leading-5 text-muted">
          {draft.timeWindow === 'anytime'
            ? 'يضع العضو علامتها متى شاء خلال اليوم.'
            : draft.timeWindow === 'range'
              ? draft.startTime && draft.endTime && draft.startTime > draft.endTime
                ? 'وقت يمتد بعد منتصف الليل: ما يُنجز بعد الثانية عشرة يُحسب لليلة التي بدأت مساء اليوم السابق، وينتهي بوقت النهاية — وما فات يُتدارك نهارًا.'
                : 'لا تُفتح قبل وقت البداية، وتبقى مفتوحة إلى آخر اليوم لمن أنجزها في وقتها.'
              : 'من صلاة العشاء إلى أذان الفجر، حسب مدينة كل عضو (مصر والسعودية وسائر البلاد العربية)، ويُعرض له الثلث الأخير من الليل. ما يُنجز بعد منتصف الليل يُحسب لليلة التي بدأت مساءً؛ وبعد الفجر تُغلق، ومن فاتته يتداركها نهارًا بنقاطها كاملة.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`task-sd-${uid}`}>
            من تاريخ <span className="font-normal text-muted">(اختياري)</span>
          </label>
          <input id={`task-sd-${uid}`} type="date" className="input" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`task-ed-${uid}`}>
            إلى تاريخ <span className="font-normal text-muted">(اختياري)</span>
          </label>
          <input
            id={`task-ed-${uid}`}
            type="date"
            className="input"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </div>
        <p className="-mt-1 text-xs text-muted sm:col-span-2">مثلًا: العشر الأواخر، أو أيام دورة علمية. خارج هذه المدة لا تظهر المهمة للأعضاء.</p>
      </div>
      <div>
        <span className="label">النقاط</span>
        <div className="flex flex-wrap items-center gap-2">
          {POINT_PRESETS.map((p) => (
            <button key={p} type="button" aria-pressed={draft.points === p} onClick={() => set({ points: p })} className={`${chip(draft.points === p)} !min-h-9 !px-3`}>
              {arNumber.format(p)}
            </button>
          ))}
          <label className="sr-only" htmlFor={`task-pts-${uid}`}>
            عدد النقاط
          </label>
          <input
            id={`task-pts-${uid}`}
            type="number"
            min={1}
            max={100}
            className="input !h-9 !w-20 !py-1"
            value={draft.points}
            onChange={(e) => set({ points: Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
          />
        </div>
        <p className="mt-1 text-xs text-muted">ما يكسبه العضو كل مرة ينجزها — اجعل الأثقل أكثر نقاطًا.</p>
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
      <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-line px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--accent-fill)]"
          checked={draft.fromLearning}
          onChange={(e) => set({ fromLearning: e.target.checked })}
        />
        <span>
          <span className="flex items-center gap-1.5 font-display text-[15px] text-fg">
            <GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" />
            تُنجَز تلقائيًا من «رحلة العلم»
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            متى سجّل العضو شيئًا من دروس الرحلة — أتمّ الدرس أو قرأ بعضه — وُضعت علامة هذه المهمة له في يومه، بلا تقيّد بوقتها. ويبقى له أن يضعها بنفسه إن طلب العلم في غير الرحلة.
          </span>
        </span>
      </label>
      <FadlPreview text={`${draft.title} ${draft.description}`} />
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
              {scheduleSummary(task)} · {arNumber.format(task.points)} نقطة
              {task.description && ` · ${task.description.slice(0, 80)}${task.description.length > 80 ? '…' : ''}`}
              {task.linkUrl && ' · فيها رابط'}
              {task.fromLearning && ' · تُنجَز من «رحلة العلم»'}
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
