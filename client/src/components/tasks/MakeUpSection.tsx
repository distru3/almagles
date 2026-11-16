import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { MissedTask } from '../../lib/types';
import { WEEKDAY_NAMES, todayISO, weekdayKey } from '../../lib/dates';
import { KHILFA, makeupTextFor, type Text } from '../../lib/fadail';
import { nowHHMM } from '../../lib/taskSchedule';
import { prayerClockFor, type Place } from '../../lib/prayerTimes';
import FadlText from './FadlText';

const arNumber = new Intl.NumberFormat('ar');

/** «أمس», «قبل يومين — الجمعة»; a night task says «ليلة …». */
function whenLabel(m: MissedTask): string {
  const diff = Math.round((new Date(`${todayISO()}T12:00:00`).getTime() - new Date(`${m.day}T12:00:00`).getTime()) / 86_400_000);
  const name = WEEKDAY_NAMES[weekdayKey(new Date(`${m.day}T12:00:00`))];
  const night = m.timeWindow === 'qiyam' ? `ليلة ${name}` : name;
  if (diff <= 1) return m.timeWindow === 'qiyam' ? 'ليلة البارحة' : 'أمس';
  return `${diff === 2 ? 'قبل يومين' : `قبل ${arNumber.format(diff)} أيام`} — ${night}`;
}

/**
 * «تدارك ما فاتك»: daily tasks missed in the last three days, which a member
 * can still make up — the full points the next day, half after — and which
 * count back into their streak. Grounded in ﴿جَعَلَ اللَّيْلَ وَالنَّهَارَ خِلْفَةً﴾.
 */
export default function MakeUpSection({
  missed,
  place,
  onMadeUp,
}: {
  missed: MissedTask[];
  place: Place;
  onMadeUp: (m: MissedTask, points: number, text: Text) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const left = missed.filter((m) => !done.has(`${m.id}|${m.day}`));
  if (left.length === 0) return null;

  const makeUp = async (m: MissedTask) => {
    const key = `${m.id}|${m.day}`;
    setPending(key);
    setError(null);
    try {
      const res = await api<{ points: number }>(`/tasks/${m.id}/makeup`, {
        method: 'PUT',
        body: { date: todayISO(), time: nowHHMM(), day: m.day, done: true, ...prayerClockFor(place) },
      });
      setDone((s) => new Set(s).add(key));
      onMadeUp(m, res.points, makeupTextFor(`${m.title} ${m.description ?? ''}`, m.timeWindow));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ — حاول مرة أخرى');
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="rounded-sm border border-warn/40 bg-warn-soft/40 px-4 py-3 sm:px-5" aria-labelledby="makeup-title">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 border-b border-line pb-2 text-start"
      >
        <h2 id="makeup-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <History className="h-5 w-5 text-warn" aria-hidden="true" />
          تدارك ما فاتك
          <span className="rounded-full bg-warn-soft px-2 text-xs font-normal text-warn">{arNumber.format(left.length)}</span>
        </h2>
        <span className="text-xs text-muted">{open ? 'إخفاء' : 'عرض'}</span>
      </button>
      {open && (
        <>
          <div className="mt-2 text-sm">
            <FadlText text={KHILFA} />
            <p className="mt-1 text-xs leading-6 text-muted">
              قال ابن عباس والحسن: من فاته عمل بالليل أدركه بالنهار، ومن فاته بالنهار أدركه بالليل. تدارك ما فاتك في آخر ثلاثة أيام: النقاط كاملة إن
              تداركته في اليوم التالي، ونصفها بعد ذلك — ويعود اليوم إلى سلسلتك.
            </p>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <ul className="mt-1 divide-y divide-line">
            {left.map((m) => {
              const key = `${m.id}|${m.day}`;
              return (
                <li key={key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px]">{m.title}</p>
                    <p className="text-xs text-muted">
                      {whenLabel(m)} · {arNumber.format(m.points)} نقطة
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void makeUp(m)}
                    disabled={pending !== null}
                    className="btn-outline !min-h-9 !px-3 !text-sm"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {pending === key ? 'جارٍ الحفظ…' : 'تداركتها'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
