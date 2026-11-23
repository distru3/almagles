import { useEffect, useId, useState } from 'react';
import { BookOpenText, Check, Clock, ExternalLink, NotebookPen, Undo2, Users } from 'lucide-react';
import type { MyLearningItem } from '../../lib/types';
import { KINDS, PART_CHOICES, arNumber, minutesLabel, pageProgress, partLabel } from '../../lib/learning';
import { youtubeId } from '../../lib/links';
import { isInternalPath, normalizeUrl } from '../../lib/url';
import { gregorianLong, hijriShort } from '../../lib/dates';
import { markDirty } from '../../lib/unsaved';
import { LinkPreviewCard } from '../PostMedia';
import { formatBytes } from '../../lib/video';
import PdfReader from './PdfReader';

/** «أتمّه ٣ من إخوانك» with Arabic number agreement. */
function othersLabel(n: number): string {
  if (n === 1) return 'أتمّه أخ واحد';
  if (n === 2) return 'أتمّه أخوان';
  if (n >= 3 && n <= 10) return `أتمّه ${arNumber.format(n)} إخوة`;
  return `أتمّه ${arNumber.format(n)} أخًا`;
}

/**
 * «فائدتي»: what the member took from the lesson, in their own words. Saved
 * only on «حفظ» (or Ctrl+S via the page's unsaved guard).
 */
function NoteEditor({ item, onSave }: { item: MyLearningItem; onSave: (note: string | null) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const dirty = open && text.trim() !== (item.note ?? '');

  const save = async () => {
    setBusy(true);
    const ok = await onSave(text.trim() || null);
    setBusy(false);
    if (ok) setOpen(false);
    return ok;
  };

  useEffect(() => {
    markDirty(`learning-note-${item.id}`, dirty ? { save } : null);
    return () => markDirty(`learning-note-${item.id}`, null);
  });

  if (!open) {
    return item.note ? (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 block w-full rounded-xl border-s-2 border-accent bg-surface-2/60 px-3.5 py-2.5 text-start">
        <span className="flex items-center gap-1.5 font-display text-xs text-accent">
          <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
          فائدتي
        </span>
        <span className="mt-1 block whitespace-pre-line text-[15px] leading-7 text-fg">{item.note}</span>
      </button>
    ) : (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 font-display text-sm text-accent hover:text-accent-strong">
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
        اكتب فائدة خرجت بها
      </button>
    );
  }
  return (
    <form
      className="mt-3 rounded-xl border border-line bg-surface-2/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`note-${uid}`} className="label">
        فائدتي — لا يراها غيرك
      </label>
      <textarea
        id={`note-${uid}`}
        className="input min-h-24 leading-7"
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="جملة تحفظها، أو معنى استوقفك، أو عمل تعزم عليه…"
        autoFocus
      />
      <div className="mt-2 flex gap-2">
        <button type="submit" className="btn-primary !min-h-10 !px-5 !text-sm" disabled={busy}>
          حفظ
        </button>
        <button
          type="button"
          className="btn-outline !min-h-10 !px-5 !text-sm"
          onClick={() => {
            setText(item.note ?? '');
            setOpen(false);
          }}
        >
          تراجع
        </button>
      </div>
    </form>
  );
}

/** What part of a lesson the member records: the page they stopped at, how much, or both. */
export type LessonPart = { page?: number; progress?: number };

/**
 * One lesson of «رحلة العلم»: what it is, its video or link, and «أتممت».
 * A lesson whose day hasn't come is shown so the member can prepare, but
 * can't be ticked; one too old to catch up says so plainly.
 *
 * Not everyone finishes the day's portion. «أنجزت بعضه» records how much
 * (ربعه / نصفه / أكثره), and closing the book part way offers «سجّل ما قرأت»
 * for the page reached — measured against the lesson's pages when it has them.
 * Either earns its share of the points and ticks «طلب العلم» in «مهامي».
 */
export default function LessonCard({
  item,
  today,
  busy,
  onToggle,
  onPart,
  onNote,
  showDate = false,
}: {
  item: MyLearningItem;
  today: string;
  busy: boolean;
  onToggle: (item: MyLearningItem, done: boolean) => void;
  onPart: (item: MyLearningItem, part: LessonPart) => Promise<boolean>;
  onNote: (item: MyLearningItem, note: string | null) => Promise<boolean>;
  showDate?: boolean;
}) {
  const [reading, setReading] = useState(false);
  /** The page the book was closed on, while «سجّل ما قرأت» waits for an answer. */
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const kind = KINDS[item.kind];
  const Icon = kind.icon;
  const yt = item.linkUrl ? youtubeId(normalizeUrl(item.linkUrl)) : null;
  const upcoming = item.date > today;
  const late = !item.done && item.worth !== null && item.date < today;
  const closed = !item.done && item.worth === null && !upcoming;
  const canTick = !item.done && !upcoming && !closed;
  const partial = !item.done && item.progress > 0;
  const hasRange = Boolean(item.startPage && item.endPage && item.endPage >= item.startPage);
  const choices = PART_CHOICES.filter((c) => c.progress > item.progress);
  const stoppedShare = stoppedAt === null ? null : pageProgress(item.startPage, item.endPage, stoppedAt);

  const closeBook = (page: number) => {
    setReading(false);
    if (!canTick || page < (item.startPage ?? 1)) return;
    // Ask only when there's something new: further than recorded, or (with no range to measure) a new place.
    if (hasRange ? (pageProgress(item.startPage, item.endPage, page) ?? 0) > item.progress : page !== item.page) setStoppedAt(page);
  };
  const record = async (part: LessonPart) => {
    if (await onPart(item, part)) {
      setStoppedAt(null);
      setChoosing(false);
    }
  };
  const partChips = (page?: number) => (
    <div className="flex flex-wrap gap-2" role="group" aria-label="كم أنجزت من الدرس">
      {choices.map((c) => (
        <button
          key={c.progress}
          type="button"
          disabled={busy}
          onClick={() => void record({ progress: c.progress, page })}
          className="min-h-10 rounded-full border border-line-strong px-4 font-display text-sm text-fg-2 transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
  return (
    <article className={`card p-4 sm:p-5 ${item.done ? '!border-accent/40' : ''}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${item.done ? 'bg-accent-fill text-on-accent' : 'bg-accent-soft text-accent'}`}
          aria-hidden="true"
        >
          {item.done ? <Check className="h-5 w-5" strokeWidth={3} /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="rounded-full bg-surface-2 px-2.5 font-display leading-6 text-fg-2">{kind.label}</span>
            {item.minutes && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                نحو {minutesLabel(item.minutes)}
              </span>
            )}
            <span className="rounded-full bg-accent-soft px-2.5 font-display leading-6 text-accent">
              {item.done
                ? `+${arNumber.format(item.earned)}`
                : partial
                  ? `+${arNumber.format(item.earned)} من ${arNumber.format(item.worth ?? item.points)}`
                  : arNumber.format(item.worth ?? item.points)}{' '}
              نقطة
            </span>
            {showDate && <span className="text-muted">{gregorianLong(item.date)} · {hijriShort(item.date)}</span>}
          </div>
          <h3 className={`mt-1.5 font-display text-lg leading-8 ${item.done ? 'text-fg-2' : 'text-fg'}`}>{item.title}</h3>
          {(item.source || item.portion) && (
            <p className="text-sm leading-6 text-fg-2">
              {item.source}
              {item.source && item.portion && <span className="text-muted"> · </span>}
              {item.portion && <span className="font-display text-accent">{item.portion}</span>}
            </p>
          )}
        </div>
      </div>

      {item.description && <p className="mt-3 whitespace-pre-line text-[15px] leading-8 text-fg-2">{item.description}</p>}

      {partial && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} aria-label="ما أنجزته من الدرس">
            <div className="h-full rounded-full bg-accent-fill" style={{ width: `${item.progress}%` }} />
          </div>
          <p className="mt-1.5 text-sm text-fg-2">
            <span className="font-display text-accent">{partLabel(item.progress)}</span>
            {item.page && <span className="text-muted"> · وصلت إلى صفحة {arNumber.format(item.page)}</span>}
            <span className="text-muted"> — أكمله متى تيسّر لك</span>
          </p>
        </div>
      )}

      {item.fileUrl && (
        <button
          type="button"
          onClick={() => setReading(true)}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3 text-start transition hover:border-accent"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent" aria-hidden="true">
            <BookOpenText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] text-fg">
              {!item.done && item.page
                ? `أكمل القراءة — من صفحة ${arNumber.format(item.page)}`
                : item.startPage
                  ? `اقرأ هنا — من صفحة ${arNumber.format(item.startPage)}`
                  : 'اقرأ هنا'}
            </span>
            <span className="block truncate text-xs text-muted">
              {item.fileName ?? 'ملف PDF'}
              {item.filePages ? ` · ${arNumber.format(item.filePages)} صفحة` : ''}
              {item.fileBytes ? ` · ${formatBytes(item.fileBytes)}` : ''}
            </span>
          </span>
        </button>
      )}

      {reading && item.fileUrl && (
        <PdfReader
          itemId={item.id}
          url={item.fileUrl}
          title={item.portion ? `${item.title} — ${item.portion}` : item.title}
          startPage={item.startPage}
          lastPage={item.page}
          onClose={closeBook}
          footer={
            canTick ? (
              <button
                type="button"
                disabled={busy}
                className="btn-primary shadow-xl"
                onClick={() => {
                  onToggle(item, true);
                  setReading(false);
                }}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {late ? 'أتممته تداركًا' : kind.done}
              </button>
            ) : item.done ? (
              <p className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 font-display text-sm text-success shadow-xl">
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                أتممت هذا الدرس
              </p>
            ) : undefined
          }
        />
      )}

      {stoppedAt !== null && canTick && (
        <div role="status" className="mt-3 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3">
          <p className="font-display text-[15px] text-fg">
            وصلت إلى صفحة {arNumber.format(stoppedAt)}
            {hasRange && item.endPage ? ` من ${arNumber.format(item.endPage)}` : ''}
            {stoppedShare ? <span className="text-sm text-muted"> — نحو {arNumber.format(stoppedShare)}٪ من الدرس</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-fg-2">{hasRange ? 'سجّل ما قرأت لتنال نصيبه من النقاط، وتُكمل من حيث وقفت.' : 'كم أنجزت من الدرس؟'}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {hasRange ? (
              <button type="button" disabled={busy} onClick={() => void record({ page: stoppedAt })} className="btn-primary !min-h-10 !px-5 !text-sm">
                سجّل ما قرأت
              </button>
            ) : (
              partChips(stoppedAt)
            )}
            <button type="button" onClick={() => setStoppedAt(null)} className="inline-flex min-h-10 items-center px-2 text-sm text-muted hover:text-fg">
              ليس الآن
            </button>
          </div>
        </div>
      )}

      {item.linkUrl &&
        (yt ? (
          <div className="mt-3">
            <LinkPreviewCard
              preview={{ url: normalizeUrl(item.linkUrl), kind: 'youtube', youtubeId: yt, title: item.title, description: item.source, image: null, siteName: null }}
              compact
            />
          </div>
        ) : (
          <a
            href={normalizeUrl(item.linkUrl)}
            target={isInternalPath(item.linkUrl) ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="btn-outline mt-3 inline-flex !min-h-10 items-center gap-1.5 !px-4 !text-sm"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {item.kind === 'reading' ? 'افتح الكتاب' : item.kind === 'audio' ? 'افتح التسجيل' : 'افتح الرابط'}
          </a>
        ))}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {item.done ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-display text-success">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
              {item.madeUp ? 'تداركته — أحسنت' : 'أتممته — بارك الله فيك'}
            </span>
            <button
              type="button"
              onClick={() => onToggle(item, false)}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-1 text-sm text-muted hover:text-fg"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              تراجع
            </button>
          </>
        ) : upcoming ? (
          <span className="text-sm text-muted">يُفتح يوم {gregorianLong(item.date)} — تهيّأ له</span>
        ) : closed ? (
          <span className="text-sm text-muted">مضى وقت تداركه — وما زال نافعًا لك أن تقرأه</span>
        ) : (
          <>
            <button type="button" onClick={() => onToggle(item, true)} disabled={busy} className="btn-primary !min-h-11 !px-6">
              <Check className="h-4 w-4" aria-hidden="true" />
              {late ? 'أتممته تداركًا' : kind.done}
            </button>
            {choices.length > 0 && (
              <button
                type="button"
                onClick={() => setChoosing((c) => !c)}
                aria-expanded={choosing}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-1 font-display text-sm text-accent hover:text-accent-strong"
              >
                أنجزت بعضه
              </button>
            )}
          </>
        )}
        {item.doneCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {othersLabel(item.doneCount)}
          </span>
        )}
      </div>
      {choosing && canTick && choices.length > 0 && (
        <div className="mt-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
          <p className="mb-2 text-sm text-fg-2">كم أنجزت منه؟ تنال نصيبه من النقاط، وتُتمّه متى تيسّر لك.</p>
          {partChips()}
        </div>
      )}
      {item.done && <NoteEditor key={item.note ?? ''} item={item} onSave={(note) => onNote(item, note)} />}
    </article>
  );
}
