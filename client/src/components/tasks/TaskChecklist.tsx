import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, ListChecks } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { MyTask, TaskRepeat } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { isInternalPath, normalizeUrl } from '../../lib/url';
import Spinner from '../Spinner';

const arNumber = new Intl.NumberFormat('ar');

export const REPEAT_LABELS: Record<TaskRepeat, string> = { daily: 'يومية', weekly: 'أسبوعية', once: 'مرة واحدة' };
/** Section headings, in the order they're shown. */
const GROUPS: { repeat: TaskRepeat; title: string; hint: string }[] = [
  { repeat: 'daily', title: 'مهام اليوم', hint: 'تتجدد كل يوم' },
  { repeat: 'weekly', title: 'مهام الأسبوع', hint: 'تتجدد كل سبت' },
  { repeat: 'once', title: 'مهام مستمرة', hint: 'تُنجز مرة واحدة' },
];

/**
 * The member's own checklist. Ticking saves at once (it's a single tap, not a
 * form) and rolls back with a message if the server refuses.
 * `compact` is the home-page card: no grouping, a link to the full page.
 */
export default function TaskChecklist({ compact = false }: { compact?: boolean }) {
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  // The day the list was loaded for: if the page stays open past midnight, reload.
  const loadedFor = useRef(todayISO());

  const load = useCallback(async () => {
    const date = todayISO();
    loadedFor.current = date;
    try {
      const res = await api<{ tasks: MyTask[] }>(`/tasks?date=${date}`);
      setTasks(res.tasks);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل المهام');
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => loadedFor.current !== todayISO() && void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const toggle = async (task: MyTask) => {
    if (pending.has(task.id)) return;
    const done = !task.done;
    setPending((p) => new Set(p).add(task.id));
    setTasks((list) => list?.map((t) => (t.id === task.id ? { ...t, done } : t)) ?? list);
    setError(null);
    try {
      await api(`/tasks/${task.id}/done`, { method: 'PUT', body: { date: todayISO(), done } });
    } catch (err) {
      setTasks((list) => list?.map((t) => (t.id === task.id ? { ...t, done: !done } : t)) ?? list);
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ العلامة — حاول مرة أخرى');
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(task.id);
        return next;
      });
    }
  };

  if (tasks === null) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (tasks.length === 0) {
    return compact ? null : (
      <div className="rounded-sm border border-dashed border-line-strong px-5 py-10 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <p className="mt-2 font-display text-lg">لا توجد مهام بعد</p>
        <p className="mt-1 text-sm text-muted">ستظهر هنا المهام التي يضعها المشرفون.</p>
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = doneCount === tasks.length;

  const row = (task: MyTask) => (
    <li key={task.id} className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.title}
        onClick={() => void toggle(task)}
        disabled={pending.has(task.id)}
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition ${
          task.done ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-line-strong hover:border-accent'
        }`}
      >
        {task.done && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => void toggle(task)}
          className={`text-start font-display text-[16px] leading-7 transition ${task.done ? 'text-muted line-through decoration-1' : 'text-fg'}`}
          tabIndex={-1}
        >
          {task.title}
        </button>
        {compact && <span className="ms-2 text-xs text-muted">{REPEAT_LABELS[task.repeat]}</span>}
        {!compact && task.description && <p className="mt-0.5 whitespace-pre-line text-sm leading-6 text-fg-2">{task.description}</p>}
        {task.linkUrl && (
          <a
            href={normalizeUrl(task.linkUrl)}
            target={isInternalPath(task.linkUrl) ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-strong"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            فتح الرابط
          </a>
        )}
      </div>
    </li>
  );

  return (
    <div>
      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`font-display ${compact ? 'text-sm' : 'text-base'} ${allDone ? 'text-success' : 'text-fg-2'}`}>
            {allDone ? 'أتممت مهامك — بارك الله فيك' : `أنجزت ${arNumber.format(doneCount)} من ${arNumber.format(tasks.length)}`}
          </p>
          {compact && (
            <Link to="/tasks" className="text-sm text-accent hover:text-accent-strong">
              كل المهام
            </Link>
          )}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-accent-fill transition-[width] duration-500" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}

      {compact ? (
        <ul className="divide-y divide-line">{tasks.map(row)}</ul>
      ) : (
        <div className="space-y-5">
          {GROUPS.map(({ repeat, title, hint }) => {
            const group = tasks.filter((t) => t.repeat === repeat);
            if (group.length === 0) return null;
            return (
              <section key={repeat} className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
                <h2 className="flex items-baseline justify-between gap-3 border-b border-line pb-2 font-display text-[18px] font-semibold">
                  {title}
                  <span className="text-xs font-normal text-muted">{hint}</span>
                </h2>
                <ul className="divide-y divide-line">{group.map(row)}</ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
