import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftRight, BellRing, Check, Link2, Trash2, Undo2 } from 'lucide-react';
import { markDirty } from '../../lib/unsaved';
import type { ScheduleColumn, ScheduleItem } from '../../lib/types';
import { WEEKDAY_NAMES, weekdayKey, hijriShort } from '../../lib/dates';
import { linkText } from '../../lib/schedule';
import { REMINDER_PRESETS, presetLabel } from '../../lib/reminderMessages';

/** The editable fields of a session. */
export interface SessionFields {
  timeLabel: string;
  section: string;
  title: string;
  notes: string;
  linkUrl: string;
  linkLabel: string;
  customValues: Record<string, string>;
  /** "HH:MM" for «حان وقت المجلس», or '' for no reminder. */
  startTime: string;
  /** Sent under the reminder (a verse, a hadith or the manager's words); '' for none. */
  reminderMessage: string;
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
    startTime: item?.startTime ?? '',
    reminderMessage: item?.reminderMessage ?? '',
  };
}

const sameFields = (a: SessionFields, b: SessionFields) =>
  a.timeLabel === b.timeLabel &&
  a.section === b.section &&
  a.title === b.title &&
  a.notes === b.notes &&
  a.linkUrl === b.linkUrl &&
  a.linkLabel === b.linkLabel &&
  a.startTime === b.startTime &&
  a.reminderMessage === b.reminderMessage &&
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
  /** Move to another day; unsaved edits, if any, are saved along with the move. */
  onMove: (date: string, fields?: SessionFields) => void;
  onDelete: () => void;
}

export default function SessionRow({ item, date, columns, weekDays, gridTemplate, highlighted, onSave, onMove, onDelete }: Props) {
  const [fields, setFieldsState] = useState<SessionFields>(() => fieldsOf(item));
  const [savedFields, setSavedFields] = useState<SessionFields>(() => fieldsOf(item));
  const [linkOpen, setLinkOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  // Refs mirror the state so saves and server updates read the latest values
  // synchronously, even before React re-renders.
  const saved = useRef<SessionFields>(savedFields);
  const latest = useRef<SessionFields>(fields);
  /** The values being sent right now, so the server's reply can be told apart from newer typing. */
  const sending = useRef<SessionFields | null>(null);
  const setFields = (next: SessionFields) => {
    latest.current = next;
    setFieldsState(next);
  };
  const rowRef = useRef<HTMLDivElement>(null);
  const isDraft = !item;
  const dirty = !sameFields(fields, savedFields);
  const registryKey = `session-${useId()}`;

  // Server copy changed (after a save or a move): adopt it, unless the writer
  // has typed something newer that isn't saved yet.
  useEffect(() => {
    const server = fieldsOf(item);
    const upToDate =
      sameFields(latest.current, saved.current) || (sending.current !== null && sameFields(latest.current, sending.current));
    sending.current = null;
    saved.current = server;
    setSavedFields(server);
    if (upToDate) setFields(server);
  }, [item]);

  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  const set = (patch: Partial<SessionFields>) => setFields({ ...latest.current, ...patch });
  const setCustom = (id: string, value: string) =>
    setFields({ ...latest.current, customValues: { ...latest.current.customValues, [id]: value } });

  /** Saves this row on request (its button, Enter, or «حفظ الكل»). */
  const save = async (): Promise<boolean> => {
    if (sending.current) return false;
    const snapshot = latest.current;
    if (!isDraft && sameFields(snapshot, saved.current)) return true;
    if (!snapshot.title.trim()) {
      setRowError('العنوان مطلوب للحفظ');
      document.getElementById(`${date}-${item?.id ?? 'new'}-title`)?.focus();
      return false;
    }
    sending.current = snapshot;
    setSaving(true);
    setRowError(null);
    const ok = await onSave(snapshot);
    setSaving(false);
    if (!ok) {
      sending.current = null;
      setRowError('تعذّر الحفظ — تحقق من الاتصال ثم اضغط «حفظ» مرة أخرى');
    }
    return ok;
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const revert = () => {
    setFields(saved.current);
    setRowError(null);
  };

  // Count this row in «حفظ الكل» and the leave-page warning while it has unsaved edits.
  useEffect(() => {
    markDirty(registryKey, dirty ? { save: () => saveRef.current() } : null);
  }, [dirty, registryKey]);
  useEffect(() => () => markDirty(registryKey, null), [registryKey]);

  const move = (to: string) => {
    if (!dirty) return onMove(to);
    // The row remounts under its new day, so its edits travel with the move.
    if (!latest.current.title.trim()) {
      setRowError('اكتب العنوان أو تراجع عن التعديل قبل النقل');
      return;
    }
    onMove(to, latest.current);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.tagName === 'INPUT' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div
      ref={rowRef}
      onKeyDown={onKeyDown}
      className={`border-b border-line px-3 py-3 transition-colors last:border-b-0 md:px-4 ${
        highlighted ? 'bg-accent-soft' : dirty || isDraft ? 'bg-accent-soft/40' : ''
      }`}
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
          <button
            type="button"
            onClick={() => setReminderOpen((o) => !o)}
            aria-expanded={reminderOpen}
            aria-label={fields.startTime ? `وقت التنبيه ${fields.startTime}` : 'إضافة وقت التنبيه'}
            title={fields.startTime ? `تنبيه «حان وقت المجلس» عند ${fields.startTime}` : 'تنبيه «حان وقت المجلس»'}
            className={`flex h-10 w-10 items-center justify-center rounded transition ${
              fields.startTime ? 'bg-accent-soft text-accent' : 'border border-dashed border-line-strong text-muted hover:text-fg'
            }`}
          >
            <BellRing className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="relative">
            <label className="sr-only" htmlFor={`${date}-${item?.id ?? 'new'}-move`}>نقل إلى يوم آخر</label>
            <ArrowLeftRight className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-fg-2" aria-hidden="true" />
            <select
              id={`${date}-${item?.id ?? 'new'}-move`}
              disabled={isDraft}
              value={date}
              onChange={(e) => move(e.target.value)}
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

      {reminderOpen && (
        <div className="mt-2 flex flex-wrap items-end gap-3 rounded border border-line bg-surface-2 p-3">
          <div>
            <label className="mb-0.5 block font-display text-xs text-muted" htmlFor={`${date}-${item?.id ?? 'new'}-start`}>
              وقت التنبيه
            </label>
            <input
              id={`${date}-${item?.id ?? 'new'}-start`}
              type="time"
              dir="ltr"
              className={`${input} w-32`}
              value={fields.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
            />
          </div>
          {fields.startTime && (
            <button type="button" onClick={() => set({ startTime: '' })} className="h-10 px-2 text-sm text-danger hover:underline">
              بدون تنبيه
            </button>
          )}
          <p className="basis-full text-xs leading-5 text-muted">
            عند هذا الوقت يصل إشعار «حان وقت المجلس» لكل الأعضاء الذين فعّلوا الإشعارات. الوقت بتوقيت جهازك.
          </p>
          <div className="basis-full">
            <label className="mb-0.5 block font-display text-xs text-muted" htmlFor={`${date}-${item?.id ?? 'new'}-preset`}>
              رسالة مع التنبيه
            </label>
            <select
              id={`${date}-${item?.id ?? 'new'}-preset`}
              className={input}
              value={
                !fields.reminderMessage
                  ? 'none'
                  : String(REMINDER_PRESETS.findIndex((p) => p.text === fields.reminderMessage)).replace(/^-1$/, 'custom')
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'none') set({ reminderMessage: '' });
                else if (v !== 'custom') set({ reminderMessage: REMINDER_PRESETS[Number(v)].text });
                else document.getElementById(`${date}-${item?.id ?? 'new'}-message`)?.focus();
              }}
            >
              <option value="none">بدون رسالة</option>
              <optgroup label="آيات">
                {REMINDER_PRESETS.map((p, i) => (p.kind === 'آية' ? <option key={i} value={i}>{presetLabel(p)}</option> : null))}
              </optgroup>
              <optgroup label="أحاديث">
                {REMINDER_PRESETS.map((p, i) => (p.kind === 'حديث' ? <option key={i} value={i}>{presetLabel(p)}</option> : null))}
              </optgroup>
              <option value="custom">رسالة من كتابتك…</option>
            </select>
            <textarea
              id={`${date}-${item?.id ?? 'new'}-message`}
              rows={3}
              maxLength={500}
              className="mt-2 w-full min-w-0 rounded border border-line bg-surface px-2.5 py-2 text-[15px] leading-7 text-fg transition placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              placeholder="اختر آية أو حديثاً من القائمة، أو اكتب ما تريد إرساله مع التنبيه"
              value={fields.reminderMessage}
              onChange={(e) => set({ reminderMessage: e.target.value })}
              aria-label="نص رسالة التنبيه"
            />
            {fields.reminderMessage && !fields.startTime && (
              <p className="mt-1 text-xs text-danger">اختر وقت التنبيه أعلاه حتى تُرسل هذه الرسالة.</p>
            )}
          </div>
        </div>
      )}

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

      {(dirty || isDraft || rowError) && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <p role="status" className={`me-auto text-xs ${rowError ? 'text-danger' : 'text-muted'}`}>
            {rowError ?? (isDraft ? 'جلسة جديدة — اكتب العنوان ثم اضغط «حفظ»' : 'تعديلات غير محفوظة')}
          </p>
          {dirty && !isDraft && (
            <button
              type="button"
              onClick={revert}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-display text-sm text-fg-2 transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              تراجع
            </button>
          )}
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary !min-h-9 !px-4 !text-sm">
            <Check className="h-4 w-4" aria-hidden="true" />
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      )}
    </div>
  );
}
