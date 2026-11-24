import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, FileText, Library, Pencil, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { LearningItem, LearningKind } from '../../lib/types';
import { gregorianLong, hijriDate, todayISO } from '../../lib/dates';
import { KINDS, KIND_ORDER, WEEK_HEAD, arNumber, dayNumber, hijriMonthLabel, isRestDay, lessonsLabel, monthGrid, monthLabel, monthOf, monthRange, shiftIso, shiftMonth } from '../../lib/learning';
import { confirmDiscard, markDirty, saveAll, useUnsavedGuard } from '../../lib/unsaved';
import { formatBytes } from '../../lib/video';
import Spinner from '../Spinner';
import LearnerReminders from './LearnerReminders';

const POINT_PRESETS = [5, 10, 15, 20, 30];
/** Mirrors MAX_BULK_ITEMS in server/src/routes/learning.ts. */
const MAX_BULK = 120;

const chip = (on: boolean) =>
  `min-h-10 rounded-full border px-4 font-display text-sm transition ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-fg-2 hover:border-accent'}`;

/** A PDF as POST /learning/files returns it. */
interface FileInfo {
  publicId: string;
  url: string;
  name: string | null;
  bytes: number | null;
  pages: number | null;
}
const fileOf = (i: LearningItem): FileInfo | null =>
  i.filePublicId && i.fileUrl ? { publicId: i.filePublicId, url: i.fileUrl, name: i.fileName, bytes: i.fileBytes, pages: i.filePages } : null;
const filePayload = (f: FileInfo | null) => ({
  filePublicId: f?.publicId ?? null,
  fileUrl: f?.url ?? null,
  fileName: f?.name ?? null,
  fileBytes: f?.bytes ?? null,
  filePages: f?.pages ?? null,
});
const pageNumber = (s: string) => (Number(s) >= 1 ? Math.round(Number(s)) : null);

interface Draft {
  date: string;
  kind: LearningKind;
  title: string;
  source: string;
  portion: string;
  linkUrl: string;
  file: FileInfo | null;
  startPage: string;
  endPage: string;
  description: string;
  minutes: string;
  points: number;
}
const draftOf = (i: LearningItem): Draft => ({
  date: i.date,
  kind: i.kind,
  title: i.title,
  source: i.source ?? '',
  portion: i.portion ?? '',
  linkUrl: i.linkUrl ?? '',
  file: fileOf(i),
  startPage: i.startPage ? String(i.startPage) : '',
  endPage: i.endPage ? String(i.endPage) : '',
  description: i.description ?? '',
  minutes: i.minutes ? String(i.minutes) : '',
  points: i.points,
});
const emptyDraft = (date: string): Draft => ({ date, kind: 'reading', title: '', source: '', portion: '', linkUrl: '', file: null, startPage: '', endPage: '', description: '', minutes: '', points: 15 });
const payloadOf = (d: Draft) => ({
  date: d.date,
  kind: d.kind,
  title: d.title.trim(),
  source: d.source.trim() || null,
  portion: d.portion.trim() || null,
  linkUrl: d.linkUrl.trim() || null,
  ...filePayload(d.file),
  startPage: d.file ? pageNumber(d.startPage) : null,
  endPage: d.file ? pageNumber(d.endPage) : null,
  description: d.description.trim() || null,
  minutes: Number(d.minutes) > 0 ? Math.round(Number(d.minutes)) : null,
  points: d.points,
});

/** Best effort: the server deletes it only if no lesson uses it. */
function discardFile(publicId: string) {
  void api(`/learning/files/${publicId.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }).catch(() => {});
}

/**
 * «إرفاق ملف PDF»: uploads at once, attaches when the lesson is saved. Files
 * uploaded here but not kept (replaced, removed, the form left) are thrown away.
 */
function PdfField({ value, onChange }: { value: FileInfo | null; onChange: (f: FileInfo | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploaded = useRef<string[]>([]);
  const uid = useId();

  useEffect(
    () => () => {
      for (const id of uploaded.current) discardFile(id);
    },
    [],
  );

  const pick = async (file: File) => {
    setError(null);
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setError('اختر ملفًا بصيغة PDF');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api<{ file: FileInfo }>('/learning/files', { method: 'POST', body });
      uploaded.current.push(res.file.publicId);
      onChange(res.file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر رفع الملف — حاول مرة أخرى');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <span className="label">ملف للقراءة داخل الموقع (PDF)</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <FileText className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm text-fg">{value.name ?? 'ملف PDF'}</span>
            <span className="block text-xs text-muted">
              {value.pages ? `${arNumber.format(value.pages)} صفحة` : 'PDF'}
              {value.bytes ? ` · ${formatBytes(value.bytes)}` : ''}
            </span>
          </span>
          <button type="button" className="btn-outline !min-h-10 !px-3 !text-sm" disabled={busy} onClick={() => input.current?.click()}>
            استبدال
          </button>
          <button type="button" aria-label="إزالة الملف" className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-danger-soft hover:text-danger" onClick={() => onChange(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button type="button" className="btn-outline !min-h-10 !text-sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {busy ? 'جارٍ رفع الملف…' : 'إرفاق ملف PDF'}
        </button>
      )}
      <input
        ref={input}
        id={`pdf-${uid}`}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
      {busy && value && <p className="mt-1 text-xs text-muted">جارٍ رفع الملف الجديد…</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function KindPicker({ value, onChange }: { value: LearningKind; onChange: (k: LearningKind) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع الدرس">
      {KIND_ORDER.map((k) => {
        const Icon = KINDS[k].icon;
        return (
          <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`${chip(value === k)} inline-flex items-center gap-1.5`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {KINDS[k].label}
          </button>
        );
      })}
    </div>
  );
}

function PointsPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="النقاط">
      {POINT_PRESETS.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)} className={chip(value === p)}>
          {arNumber.format(p)}
        </button>
      ))}
    </div>
  );
}

/** Add or edit one lesson. Saves only on «حفظ» (or Ctrl+S); unsaved edits are guarded. */
function ItemForm({ initial, dirtyKey, onSubmit, onCancel }: { initial: Draft; dirtyKey: string; onSubmit: (d: Draft) => Promise<string | null>; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const uid = useId();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const submit = async () => {
    if (!draft.title.trim()) {
      setError('عنوان الدرس مطلوب');
      return false;
    }
    if (isRestDay(draft.date)) {
      setError('يوم الجمعة يوم استجمام — اختر يومًا آخر');
      return false;
    }
    setBusy(true);
    const err = await onSubmit(draft);
    setBusy(false);
    setError(err);
    return err === null;
  };

  useEffect(() => {
    markDirty(dirtyKey, dirty ? { save: submit } : null);
    return () => markDirty(dirtyKey, null);
  });

  const id = (name: string) => `${name}-${uid}`;
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-surface-2/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <span className="label">نوع الدرس</span>
        <KindPicker value={draft.kind} onChange={(kind) => set({ kind })} />
      </div>
      <div>
        <label className="label" htmlFor={id('title')}>
          العنوان
        </label>
        <input id={id('title')} className="input" value={draft.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="مثال: شرح الأربعين النووية" autoFocus />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id('source')}>
            الكتاب أو الشيخ
          </label>
          <input id={id('source')} className="input" value={draft.source} maxLength={200} onChange={(e) => set({ source: e.target.value })} placeholder="الإمام النووي" />
        </div>
        <div>
          <label className="label" htmlFor={id('portion')}>
            المقدار
          </label>
          <input id={id('portion')} className="input" value={draft.portion} maxLength={200} onChange={(e) => set({ portion: e.target.value })} placeholder="من ص ١٢ إلى ص ٢٠" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={id('link')}>
          الرابط (يوتيوب، كتاب PDF، مقالة…)
        </label>
        <input id={id('link')} dir="ltr" className="input" value={draft.linkUrl} maxLength={2000} onChange={(e) => set({ linkUrl: e.target.value })} placeholder="https://youtu.be/…" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <PdfField value={draft.file} onChange={(file) => set({ file })} />
        {draft.file && (
          <div className="flex gap-3">
            <div>
              <label className="label" htmlFor={id('page')}>
                من صفحة
              </label>
              <input id={id('page')} type="number" min={1} inputMode="numeric" className="input w-28" value={draft.startPage} onChange={(e) => set({ startPage: e.target.value })} placeholder="١" />
            </div>
            <div>
              <label className="label" htmlFor={id('end-page')}>
                إلى صفحة
              </label>
              <input id={id('end-page')} type="number" min={1} inputMode="numeric" className="input w-28" value={draft.endPage} onChange={(e) => set({ endPage: e.target.value })} placeholder="٢٠" />
            </div>
          </div>
        )}
      </div>
      {draft.file && (
        // Without the last page, reading part of the lesson can't be measured and the member picks «ربعه / نصفه / أكثره».
        <p className="-mt-1 text-xs text-muted">بصفحتي البداية والنهاية يُحسب ما قرأه الأخ إن لم يُتمّ الدرس، فينال نصيبه من النقاط.</p>
      )}
      <div>
        <label className="label" htmlFor={id('desc')}>
          توجيه للإخوة (اختياري)
        </label>
        <textarea id={id('desc')} className="input min-h-20 leading-7" value={draft.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} placeholder="ما الذي ينبغي أن ينتبه إليه الأخ وهو يقرأ أو يشاهد…" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
        <div>
          <label className="label" htmlFor={id('date')}>
            اليوم
          </label>
          <input id={id('date')} type="date" className="input" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <span className="label">النقاط</span>
          <PointsPicker value={draft.points} onChange={(points) => set({ points })} />
        </div>
        <div>
          <label className="label" htmlFor={id('min')}>
            المدة (دقائق)
          </label>
          <input id={id('min')} type="number" min={1} max={600} inputMode="numeric" className="input sm:w-28" value={draft.minutes} onChange={(e) => set({ minutes: e.target.value })} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          حفظ
        </button>
        <button type="button" className="btn-outline" onClick={onCancel}>
          تراجع
        </button>
      </div>
    </form>
  );
}

type Unit = 'page' | 'hadith' | 'lesson';
const UNITS: Record<Unit, { label: string; one: (n: string) => string; many: (a: string, b: string) => string }> = {
  page: { label: 'صفحات', one: (n) => `ص ${n}`, many: (a, b) => `من ص ${a} إلى ص ${b}` },
  hadith: { label: 'أحاديث', one: (n) => `الحديث ${n}`, many: (a, b) => `الأحاديث ${a}–${b}` },
  lesson: { label: 'دروس / مقاطع', one: (n) => `الدرس ${n}`, many: (a, b) => `الدروس ${a}–${b}` },
};
const OFF_DAYS = [6, 0, 1, 2, 3, 4]; // Saturday → Thursday (JS getDay); Friday is always off.

/**
 * «خطة كتاب»: lay a book (or a series) out over the coming days — so many
 * pages a day from a start date, skipping Fridays and any day chosen — and
 * preview it before creating every lesson at once.
 */
function BookPlan({ onDone, onCancel }: { onDone: (count: number) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [kind, setKind] = useState<LearningKind>('reading');
  const [unit, setUnit] = useState<Unit>('page');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('');
  const [per, setPer] = useState('10');
  const [start, setStart] = useState(() => shiftIso(todayISO(), 1));
  const [skip, setSkip] = useState<number[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<FileInfo | null>(null);
  /** The page of the file where «from» begins — a book's page 1 is rarely the PDF's. */
  const [fileStart, setFileStart] = useState('');
  const [minutes, setMinutes] = useState('');
  const [points, setPoints] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const plan = useMemo(() => {
    const a = Math.floor(Number(from));
    const b = Math.floor(Number(to));
    const step = Math.floor(Number(per));
    if (!title.trim() || !(a >= 1) || !(b >= a) || !(step >= 1) || !start) return [];
    const out: { date: string; portion: string; startPage: number | null; endPage: number | null }[] = [];
    const first = pageNumber(fileStart) ?? a;
    let day = start;
    for (let n = a; n <= b && out.length <= MAX_BULK; n += step) {
      while (isRestDay(day) || skip.includes(new Date(`${day}T12:00:00`).getDay())) day = shiftIso(day, 1);
      const end = Math.min(b, n + step - 1);
      const [x, y] = [arNumber.format(n), arNumber.format(end)];
      out.push({ date: day, portion: n === end ? UNITS[unit].one(x) : UNITS[unit].many(x, y), startPage: file && unit === 'page' ? first + (n - a) : null, endPage: file && unit === 'page' ? first + (end - a) : null });
      day = shiftIso(day, 1);
    }
    return out;
  }, [title, from, to, per, start, skip, unit, file, fileStart]);

  const create = async () => {
    if (plan.length === 0) {
      setError('أكمل عنوان الكتاب والمقدار وتاريخ البداية');
      return;
    }
    if (plan.length > MAX_BULK) {
      setError(`الخطة أطول من ${arNumber.format(MAX_BULK)} درسًا — زد المقدار اليومي أو قسّمها`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const m = Number(minutes) > 0 ? Math.round(Number(minutes)) : null;
      await api('/learning/items/bulk', {
        method: 'POST',
        body: {
          items: plan.map((p) => ({ date: p.date, kind, title: title.trim(), source: source.trim() || null, portion: p.portion, linkUrl: linkUrl.trim() || null, ...filePayload(file), startPage: p.startPage, endPage: p.endPage, minutes: m, points })),
        },
      });
      onDone(plan.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إنشاء الخطة');
    } finally {
      setBusy(false);
    }
  };

  const id = (n: string) => `${n}-${uid}`;
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-[18px] font-semibold text-fg">
            <Library className="h-5 w-5 text-accent" aria-hidden="true" />
            خطة كتاب
          </h3>
          <p className="text-xs text-muted">وزّع كتابًا أو سلسلة على الأيام القادمة دفعة واحدة — الجمعة مستثناة دائمًا.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={id('t')}>
              عنوان الكتاب أو السلسلة
            </label>
            <input id={id('t')} className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="رياض الصالحين" />
          </div>
          <div>
            <label className="label" htmlFor={id('s')}>
              المؤلف أو الشيخ
            </label>
            <input id={id('s')} className="input" value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} />
          </div>
        </div>
        <div>
          <span className="label">نوع الدرس</span>
          <KindPicker value={kind} onChange={setKind} />
        </div>
        <div>
          <span className="label">يُقسَم على</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الوحدة">
            {(Object.keys(UNITS) as Unit[]).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={chip(unit === u)}>
                {UNITS[u].label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor={id('f')}>
              من
            </label>
            <input id={id('f')} type="number" min={1} inputMode="numeric" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('to')}>
              إلى
            </label>
            <input id={id('to')} type="number" min={1} inputMode="numeric" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('p')}>
              كل يوم
            </label>
            <input id={id('p')} type="number" min={1} inputMode="numeric" className="input" value={per} onChange={(e) => setPer(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div>
            <label className="label" htmlFor={id('st')}>
              يبدأ يوم
            </label>
            <input id={id('st')} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <span className="label">أيام أخرى بلا درس</span>
            <div className="flex flex-wrap gap-1.5">
              {OFF_DAYS.map((d) => {
                const on = skip.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setSkip((s) => (on ? s.filter((x) => x !== d) : [...s, d]))} className={`${chip(on)} !px-3`}>
                    {WEEK_HEAD[(d + 1) % 7]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={id('l')}>
            الرابط (اختياري — يتكرر في كل درس)
          </label>
          <input id={id('l')} dir="ltr" className="input" value={linkUrl} maxLength={2000} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <PdfField value={file} onChange={setFile} />
          {file && unit === 'page' && (
            <div>
              <label className="label" htmlFor={id('fs')}>
                صفحة «من» في الملف
              </label>
              <input id={id('fs')} type="number" min={1} inputMode="numeric" className="input sm:w-28" value={fileStart} onChange={(e) => setFileStart(e.target.value)} placeholder={from || '١'} />
            </div>
          )}
        </div>
        {file && unit === 'page' && <p className="-mt-1 text-xs text-muted">يُفتح كل درس على صفحته من الملف. إن كانت صفحة الكتاب ١ هي الصفحة ٥ في الملف فاكتب ٥.</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <span className="label">النقاط لكل درس</span>
            <PointsPicker value={points} onChange={setPoints} />
          </div>
          <div>
            <label className="label" htmlFor={id('m')}>
              المدة (دقائق)
            </label>
            <input id={id('m')} type="number" min={1} max={600} inputMode="numeric" className="input sm:w-28" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
        </div>

        {plan.length > 0 && (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm">
            <p className="font-display text-fg">
              {lessonsLabel(Math.min(plan.length, MAX_BULK + 1))}
              {plan.length > MAX_BULK ? ' أو أكثر' : ''} — من {gregorianLong(plan[0].date)} إلى {gregorianLong(plan[plan.length - 1].date)}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-fg-2">
              {plan.slice(0, 4).map((p) => (
                <li key={p.date}>
                  <span className="text-muted">{gregorianLong(p.date)}:</span> {p.portion}
                </li>
              ))}
              {plan.length > 4 && <li className="text-muted">…</li>}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={busy || plan.length === 0} onClick={() => void create()}>
            إنشاء الخطة
          </button>
          <button type="button" className="btn-outline" onClick={onCancel}>
            تراجع
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * «إدارة الرحلة», for admins and schedule managers: the month's calendar, the
 * lessons of the chosen day (add, edit, move, delete) with how many members
 * finished each, and «خطة كتاب» to lay out many days at once.
 */
export default function LearningManager() {
  const [today] = useState(todayISO);
  const [month, setMonth] = useState(() => monthOf(today));
  const [items, setItems] = useState<LearningItem[] | null>(null);
  const [members, setMembers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useUnsavedGuard(() => void saveAll());

  const seq = useRef(0);
  const load = useCallback(async () => {
    // Only the latest request counts, when the month is changed quickly.
    const run = ++seq.current;
    const { from, to } = monthRange(month);
    try {
      const res = await api<{ items: LearningItem[]; members: number }>(`/learning/manage?from=${from}&to=${to}`);
      if (run !== seq.current) return;
      setItems(res.items);
      setMembers(res.members);
      setError(null);
    } catch (err) {
      if (run === seq.current) setError(err instanceof ApiError ? err.message : 'تعذّر تحميل التقويم');
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, LearningItem[]>();
    for (const i of items ?? []) (map.get(i.date) ?? map.set(i.date, []).get(i.date)!).push(i);
    return map;
  }, [items]);

  const save = async (d: Draft, id: string | null): Promise<string | null> => {
    try {
      await api(id ? `/learning/items/${id}` : '/learning/items', { method: id ? 'PUT' : 'POST', body: payloadOf(d) });
      setEditing(null);
      if (monthOf(d.date) !== month) setMonth(monthOf(d.date));
      setDay(d.date);
      await load();
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'تعذّر الحفظ';
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/learning/items/${id}`, { method: 'DELETE' });
      setConfirming(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  const dayItems = byDay.get(day) ?? [];
  const monthCount = items?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm text-fg-2">
          <Users className="h-4 w-4 text-accent" aria-hidden="true" />
          في الرحلة الآن {arNumber.format(members)} {members === 1 ? 'عضو' : 'أعضاء'} · {lessonsLabel(monthCount)} هذا الشهر
        </p>
        {!planning && (
          <button type="button" className="btn-outline !min-h-10 !text-sm" onClick={() => setPlanning(true)}>
            <Library className="h-4 w-4" aria-hidden="true" />
            خطة كتاب
          </button>
        )}
      </div>

      <LearnerReminders today={today} />

      {notice && (
        <p role="status" className="rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">
          {notice}
        </p>
      )}
      {planning && (
        <BookPlan
          onCancel={() => setPlanning(false)}
          onDone={(count) => {
            setPlanning(false);
            setNotice(`أُضيف ${lessonsLabel(count)} إلى التقويم.`);
            void load();
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section aria-label="تقويم الرحلة" className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2" aria-label="الشهر السابق">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="text-center">
              <h2 className="font-display text-[18px] font-semibold text-fg">{monthLabel(month)}</h2>
              <p className="text-xs text-muted">{hijriMonthLabel(month)}</p>
            </div>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2" aria-label="الشهر التالي">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
          {items === null ? (
            <Spinner />
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-7 gap-1 pb-1">
                {WEEK_HEAD.map((d) => (
                  <span key={d} className="text-center font-display text-[11px] text-muted sm:text-xs">
                    {d}
                  </span>
                ))}
              </div>
              {monthGrid(month).map((week, i) => (
                <div key={i} className="grid grid-cols-7 gap-1 py-0.5">
                  {week.map((d, j) => {
                    if (!d) return <span key={j} />;
                    const n = byDay.get(d)?.length ?? 0;
                    const rest = isRestDay(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          if (d === day || !confirmDiscard()) return;
                          setDay(d);
                          setEditing(null);
                        }}
                        aria-pressed={d === day}
                        aria-label={`${gregorianLong(d)} — ${rest ? 'يوم الاستجمام' : n ? lessonsLabel(n) : 'لا درس'}`}
                        className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-xl font-display text-sm transition ${
                          rest ? 'bg-surface-2/70 text-muted' : n ? 'bg-accent-soft text-accent' : 'border border-dashed border-line text-fg-2'
                        } ${d === day ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:opacity-85'} ${d === today ? 'font-black' : ''}`}
                      >
                        {dayNumber(d)}
                        {n > 0 && <span className="text-[10px] leading-none">{arNumber.format(n)}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="دروس اليوم المختار" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[18px] font-semibold text-fg">{gregorianLong(day)}</h2>
            <span className="text-xs text-muted">{hijriDate(day)}</span>
          </div>
          {isRestDay(day) ? (
            <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
              <Coffee className="mx-auto h-7 w-7 text-muted" aria-hidden="true" />
              <p className="mt-2 font-display text-fg">الجمعة يوم الاستجمام</p>
              <p className="mt-1 text-sm text-muted">لا تُوضع فيه دروس، ولا تنقطع به سلاسل الإخوة.</p>
            </div>
          ) : (
            <>
              {dayItems.length === 0 && editing !== 'new' && <p className="text-sm text-muted">لا درس في هذا اليوم بعد.</p>}
              <ul className="space-y-2">
                {dayItems.map((i) => {
                  const Icon = KINDS[i.kind].icon;
                  if (editing === i.id) {
                    return (
                      <li key={i.id}>
                        <ItemForm initial={draftOf(i)} dirtyKey={`learning-item-${i.id}`} onSubmit={(d) => save(d, i.id)} onCancel={() => setEditing(null)} />
                      </li>
                    );
                  }
                  return (
                    <li key={i.id} className="card px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-[16px] text-fg">{i.title}</p>
                          <p className="text-xs leading-6 text-muted">
                            {KINDS[i.kind].label}
                            {i.source && ` · ${i.source}`}
                            {i.portion && ` · ${i.portion}`}
                            {i.fileUrl && ` · PDF${i.startPage ? ` من ص ${arNumber.format(i.startPage)}` : ""}${i.endPage ? ` إلى ص ${arNumber.format(i.endPage)}` : ""}`} · {arNumber.format(i.points)} نقطة
                          </p>
                          <p className="text-xs text-fg-2">
                            أتمّه {arNumber.format(i.doneCount)} من {arNumber.format(members)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => confirmDiscard() && setEditing(i.id)} aria-label={`تعديل «${i.title}»`} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-accent">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setConfirming(i.id)} aria-label={`حذف «${i.title}»`} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-danger-soft hover:text-danger">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {confirming === i.id && (
                        <div className="mt-3 rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm">
                          <p className="text-danger">
                            يُحذف الدرس{i.doneCount ? ` ومعه علامات ${arNumber.format(i.doneCount)} من الإخوة عليه، وتبقى فوائدهم لهم` : ''}. هل أنت متأكد؟
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button type="button" className="btn-danger !min-h-10 !text-sm" onClick={() => void remove(i.id)}>
                              حذف
                            </button>
                            <button type="button" className="btn-outline !min-h-10 !text-sm" onClick={() => setConfirming(null)}>
                              تراجع
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {editing === 'new' ? (
                <ItemForm key={day} initial={emptyDraft(day)} dirtyKey="learning-item-new" onSubmit={(d) => save(d, null)} onCancel={() => setEditing(null)} />
              ) : (
                <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  إضافة درس لهذا اليوم
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
