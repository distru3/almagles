import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Link2, Trash2 } from 'lucide-react';
import type { ScheduleColumn, ScheduleItem } from '../../lib/types';
import { WEEKDAY_NAMES, weekdayKey, hijriShort } from '../../lib/dates';
import { linkText } from '../../lib/schedule';

/** The editable fields of a session. */
export interface SessionFields {
  timeLabel: string;
  section: string;
  title: string;
  notes: string;
  linkUrl: string;
  linkLabel: string;
  customValues: Record<string, string>;
}

export function fieldsOf(item?: ScheduleItem): SessionFields {
  return {
    timeLabel: item?.timeLabel ?? '',
    section: item?.section ?? '',
    title: item?.title ?? '',
    notes: item?.notes ?? '',
    linkUrl: item?.linkUrl ?? '',
    linkLabel: item?.linkLabel ?? '',
    customValues: { ...(item?.customValues ?? {}) },
  };
}

const sameFields = (a: SessionFields, b: SessionFields) =>
  a.timeLabel === b.timeLabel &&
  a.section === b.section &&
  a.title === b.title &&
  a.notes === b.notes &&
  a.linkUrl === b.linkUrl &&
  a.linkLabel === b.linkLabel &&
  JSON.stringify(a.customValues) === JSON.stringify(b.customValues);

const input =
  'h-10 w-full min-w-0 rounded border border-line bg-surface px-2.5 text-[15px] text-fg transition placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';
const label = 'mb-0.5 block font-display text-xs text-muted md:sr-only';

interface Props {
  /** Undefined for a draft that hasn't been saved yet. */
  item?: ScheduleItem;
  date: string;
  columns: ScheduleColumn[];
  weekDays: string[];
  gridTemplate: string;
  highlighted?: boolean;
  /** Save edits; for a draft, create it. Resolves false when the save failed. */
  onSave: (fields: SessionFields) => Promise<boolean>;
  onMove: (date: string) => void;
  onDelete: () => void;
}

export default function SessionRow({ item, date, columns, weekDays, gridTemplate, highlighted, onSave, onMove, onDelete }: Props) {
  const [fields, setFieldsState] = useState<SessionFields>(() => fieldsOf(item));
  const [linkOpen, setLinkOpen] = useState(false);
  const saved = useRef<SessionFields>(fieldsOf(item));
  // Updated synchronously on every keystroke, so leaving the row right after
  // typing (Tab, autofill) saves what was typed even before React re-renders.
  const latest = useRef<SessionFields>(fields);
  const setFields = (next: SessionFields) => {
    latest.current = next;
    setFieldsState(next);
  };
  const rowRef = useRef<HTMLDivElement>(null);
  const isDraft = !item;

  // Server copy changed (e.g. after a save elsewhere): adopt it.
  useEffect(() => {
    saved.current = fieldsOf(item);
    setFields(fieldsOf(item));
  }, [item]);

  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  const set = (patch: Partial<SessionFields>) => setFields({ ...latest.current, ...patch });
  const setCustom = (id: string, value: string) =>
    setFields({ ...latest.current, customValues: { ...latest.current.customValues, [id]: value } });

  /** Save when focus leaves the row, so moving between its fields doesn't save half-typed values. */
  const commit = async (e: React.FocusEvent) => {
    if (rowRef.current?.contains(e.relatedTarget as Node | null)) return;
    const snapshot = latest.current;
    if (sameFields(snapshot, saved.current)) return;
    if (!snapshot.title.trim()) {
      if (!isDraft) setFields(saved.current); // a saved session must keep its title
      return;
    }
    if (await onSave(snapshot)) saved.current = snapshot;
  };

  return (
    <div
      ref={rowRef}
      onBlur={commit}
      className={`border-b border-line px-3 py-3 last:border-b-0 md:px-4 ${highlighted ? 'bg-accent-soft' : ''}`}
    >
      <div
        className="grid grid-cols-2 items-end gap-2 md:items-center md:[grid-template-columns:var(--session-cols)]"
        style={{ '--session-cols': gridTemplate } as React.CSSProperties}
      >
        <div>
          <label className={label} htmlFor={`${date}-${item?.id ?? 'new'}-time`}>الوقت</label>
          <input id={`${date}-${item?.id ?? 'new'}-time`} className={input} list="sched-time" placeholder="الوقت" value={fields.timeLabel} onChange={(e) => set({ timeLabel: e.target.value })} aria-label="الوقت" />
        </div>
        <div>
          <label className={label} htmlFor={`${date}-${item?.id ?? 'new'}-section`}>القسم</label>
          <input id={`${date}-${item?.id ?? 'new'}-section`} className={input} list="sched-section" placeholder="القسم" value={fields.section} onChange={(e) => set({ section: e.target.value })} aria-label="القسم" />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className={label} htmlFor={`${date}-${item?.id ?? 'new'}-title`}>العنوان</label>
          <input
            id={`${date}-${item?.id ?? 'new'}-title`}
            className={`${input} font-semibold`}
            list="sched-title"
            placeholder={isDraft ? 'عنوان الجلسة (مطلوب للحفظ)' : 'العنوان'}
            value={fields.title}
            onChange={(e) => set({ title: e.target.value })}
            aria-label="العنوان"
            aria-required="true"
            autoFocus={isDraft}
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className={label} htmlFor={`${date}-${item?.id ?? 'new'}-notes`}>ملاحظات</label>
          <input id={`${date}-${item?.id ?? 'new'}-notes`} className={input} placeholder="ملاحظات" value={fields.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="ملاحظات" />
        </div>
        {columns.map((c) => (
          <div key={c.id}>
            <label className={label} htmlFor={`${date}-${item?.id ?? 'new'}-${c.id}`}>{c.label}</label>
            <input
              id={`${date}-${item?.id ?? 'new'}-${c.id}`}
              className={input}
              list={`sched-col-${c.id}`}
              placeholder={c.label}
              value={fields.customValues[c.id] ?? ''}
              onChange={(e) => setCustom(c.id, e.target.value)}
              aria-label={c.label}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLinkOpen((o) => !o)}
          aria-expanded={linkOpen}
          className={`flex h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded px-2.5 text-[13px] whitespace-nowrap ${
            fields.linkUrl ? 'bg-accent-soft text-accent' : 'border border-dashed border-line-strong text-muted hover:text-fg'
          }`}
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{fields.linkUrl ? linkText(fields) : 'إضافة رابط'}</span>
        </button>
        <div className="flex justify-end gap-1">
          <div className="relative">
            <label className="sr-only" htmlFor={`${date}-${item?.id ?? 'new'}-move`}>نقل إلى يوم آخر</label>
            <ArrowLeftRight className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-fg-2" aria-hidden="true" />
            <select
              id={`${date}-${item?.id ?? 'new'}-move`}
              disabled={isDraft}
              value={date}
              onChange={(e) => onMove(e.target.value)}
              className="h-10 w-10 cursor-pointer appearance-none rounded border border-line bg-transparent text-transparent disabled:cursor-not-allowed disabled:opacity-40"
              title="نقل إلى يوم آخر"
            >
              {weekDays.map((d) => (
                <option key={d} value={d} className="text-fg">
                  {WEEKDAY_NAMES[weekdayKey(new Date(`${d}T12:00:00`))]} {hijriShort(d)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onDelete}
            aria-label={isDraft ? 'إلغاء الجلسة الجديدة' : 'حذف الجلسة'}
            title={isDraft ? 'إلغاء' : 'حذف'}
            className="flex h-10 w-10 items-center justify-center rounded border border-line text-danger transition hover:border-danger hover:bg-danger-soft"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {linkOpen && (
        <div className="mt-2 grid gap-2 rounded border border-line bg-surface-2 p-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label className="mb-0.5 block font-display text-xs text-muted" htmlFor={`${date}-${item?.id ?? 'new'}-url`}>الرابط</label>
            <input id={`${date}-${item?.id ?? 'new'}-url`} dir="ltr" className={input} placeholder="https://youtu.be/…" value={fields.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} />
          </div>
          <div>
            <label className="mb-0.5 block font-display text-xs text-muted" htmlFor={`${date}-${item?.id ?? 'new'}-label`}>النص الظاهر للرابط</label>
            <input id={`${date}-${item?.id ?? 'new'}-label`} className={input} placeholder="فتح الرابط" value={fields.linkLabel} onChange={(e) => set({ linkLabel: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}
