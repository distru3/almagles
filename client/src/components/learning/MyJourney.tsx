import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarClock, CalendarDays, Coffee, GraduationCap, History, LogOut, RotateCcw, Sparkles, Users, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { LearningJourney, MyLearningItem } from '../../lib/types';
import { gregorianLong, hijriDate, todayISO } from '../../lib/dates';
import { FADAIL, LA_YAMALL, type Text } from '../../lib/fadail';
import { ILM_TEXTS, KINDS, LEARN_MAKEUP_DAYS, arNumber, isRestDay, lessonsLabel, monthOf, monthRange, shiftMonth } from '../../lib/learning';
import { saveAll, useUnsavedGuard } from '../../lib/unsaved';
import Spinner from '../Spinner';
import FadlText from '../tasks/FadlText';
import LessonCard, { type LessonPart } from './LessonCard';
import JourneyMap from './JourneyMap';
import JourneyProgress from './JourneyProgress';

const KAHF = FADAIL.find((f) => f.id === 'kahf')!.texts[0];

interface Bushra {
  title: string;
  points: number;
  madeUp: boolean;
  dayDone: boolean;
  /** Only part of the lesson was recorded («أنجزت بعضه»). */
  partial: boolean;
  /** «طلب العلم» tasks in «مهامي» this ticked. */
  tasks: string[];
  text: Text;
  key: number;
}

type RecordResult = { points: number; madeUp: boolean; dayDone: boolean; tasks: string[] };

/** «ووُضعت علامة «طلب العلم» في مهامي». */
const tasksNote = (tasks: string[]) => (tasks.length ? ` — ووُضعت علامة ${tasks.map((t) => `«${t}»`).join(' و')} في «مهامي»` : '');

/** The invitation — for a member who hasn't joined, or stepped aside. Never pressed twice. */
function Invite({ data, onChoose, busy }: { data: LearningJourney; onChoose: (active: boolean) => void; busy: boolean }) {
  const declined = data.enrollment?.active === false;
  const coming = data.items.filter((i) => i.date >= data.today).slice(0, 3);
  const points = [
    { icon: BookOpen, text: 'لكل يوم درسه: صفحات من كتاب، أو درس مرئي، أو مقالة — بقدر ما يطيقه المشغول.' },
    { icon: Coffee, text: 'الجمعة يوم استجمام، لا درس فيه ولا تنقطع به سلسلتك.' },
    { icon: RotateCcw, text: `ما فاتك تتداركه خلال ${arNumber.format(LEARN_MAKEUP_DAYS)} أيام، ونقاطك تُحسب في «ساحة الهمّة».` },
    { icon: Users, text: 'تسير مع إخوانك على تقويم واحد، وترى تقدّمهم ويرون تقدّمك.' },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line bg-accent-soft/60 px-5 py-6 text-center sm:px-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <GraduationCap className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-display text-2xl font-black text-fg">{declined ? 'الرحلة بانتظارك متى شئت' : 'هل تسير معنا في رحلة العلم؟'}</h2>
        <FadlText text={ILM_TEXTS[0]} className="mx-auto mt-3 max-w-xl" />
      </div>
      <div className="px-5 py-5 sm:px-8">
        <ul className="grid gap-3 sm:grid-cols-2">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-[15px] leading-7 text-fg-2">
              <Icon className="mt-1.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
        {coming.length > 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-line-strong px-4 py-3">
            <p className="font-display text-sm text-fg-2">من دروس الأيام القادمة</p>
            <ul className="mt-1 space-y-1 text-sm text-fg">
              {coming.map((i) => (
                <li key={i.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{gregorianLong(i.date)}:</span>
                  {i.title}
                  {i.portion && <span className="text-accent">({i.portion})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn-primary !px-8" disabled={busy} onClick={() => onChoose(true)}>
            ابدأ الرحلة
          </button>
          {!declined && (
            <button type="button" className="btn-outline" disabled={busy} onClick={() => onChoose(false)}>
              ليس الآن
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          {data.members > 0 ? `يسير فيها الآن ${arNumber.format(data.members)} من إخوانك — ` : ''}
          المشاركة اختيار منك، تنضم متى شئت وتغادر متى شئت.
        </p>
      </div>
    </section>
  );
}

/** «يوم الاستجمام»: Friday's card in place of a lesson. */
function RestCard() {
  return (
    <div className="card px-5 py-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
        <Coffee className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="mt-3 font-display text-xl text-fg">اليوم يوم الاستجمام</h3>
      <p className="mx-auto mt-1 max-w-md text-[15px] leading-7 text-fg-2">لا درس اليوم ولا تنقطع به سلسلتك. أرح ذهنك، واجعل يومك للجمعة وما فيها من خير، ثم نلتقي غدًا على درس جديد.</p>
      <FadlText text={LA_YAMALL} className="mx-auto mt-3 max-w-lg" />
      <div className="mx-auto mt-4 max-w-lg border-t border-line pt-3">
        <FadlText text={KAHF} />
        <Link to="/quran?sura=18" className="mt-2 inline-flex min-h-10 items-center gap-1.5 font-display text-sm text-accent hover:text-accent-strong">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          اقرأ سورة الكهف
        </Link>
      </div>
    </div>
  );
}

/**
 * «رحلتي»: the member's own journey — the invitation if they haven't joined;
 * otherwise their progress, today's lesson (or Friday's rest), what they can
 * still catch up, «خريطة الرحلة» and what's coming.
 */
export default function MyJourney() {
  const [today] = useState(todayISO);
  const [month, setMonth] = useState(() => monthOf(today));
  const [data, setData] = useState<LearningJourney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [bushra, setBushra] = useState<Bushra | null>(null);
  const [leaving, setLeaving] = useState(false);
  const seq = useRef(0);
  const ticks = useRef(0);

  useUnsavedGuard(() => void saveAll());

  const load = useCallback(async () => {
    const run = ++seq.current;
    const { from, to } = monthRange(month);
    try {
      const res = await api<LearningJourney>(`/learning?date=${today}&from=${from}&to=${to}`);
      if (run === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (err) {
      if (run === seq.current) setError(err instanceof ApiError ? err.message : 'تعذّر تحميل رحلة العلم');
    }
  }, [month, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, MyLearningItem[]>();
    for (const i of data?.items ?? []) (map.get(i.date) ?? map.set(i.date, []).get(i.date)!).push(i);
    return map;
  }, [data]);

  const patch = (id: string, change: Partial<MyLearningItem>) =>
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...change } : i)) } : d));

  const choose = async (active: boolean) => {
    setBusy(true);
    try {
      await api('/learning/enrollment', { method: 'PUT', body: { date: today, active } });
      setLeaving(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ — حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: MyLearningItem, done: boolean) => {
    if (pending.has(item.id)) return;
    setPending((p) => new Set(p).add(item.id));
    patch(item.id, { done, doneCount: Math.max(0, item.doneCount + (done ? 1 : -1)), earned: done ? (item.worth ?? 0) : 0 });
    setError(null);
    if (!done) setBushra(null);
    try {
      const res = await api<RecordResult>(`/learning/items/${item.id}/done`, {
        method: 'PUT',
        body: { date: today, done },
      });
      if (done) {
        const key = ++ticks.current;
        setBushra({
          title: item.title,
          // What this tick added: the rest of the points, if part was already recorded.
          points: res.points - item.earned,
          madeUp: res.madeUp,
          dayDone: res.dayDone && item.date === today,
          partial: false,
          tasks: res.tasks,
          text: ILM_TEXTS[(key + new Date().getDate()) % ILM_TEXTS.length],
          key,
        });
      }
      await load();
    } catch (err) {
      patch(item.id, item);
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ — حاول مرة أخرى');
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(item.id);
        return next;
      });
    }
  };

  /** «أنجزت بعضه» / «سجّل ما قرأت»: part of a lesson, by how much or by the page reached. */
  const part = async (item: MyLearningItem, body: LessonPart) => {
    if (pending.has(item.id)) return false;
    setPending((p) => new Set(p).add(item.id));
    setError(null);
    try {
      const res = await api<RecordResult & { progress: number }>(`/learning/items/${item.id}/progress`, { method: 'PUT', body: { date: today, ...body } });
      const key = ++ticks.current;
      setBushra({
        title: item.title,
        points: res.points - item.earned,
        madeUp: false,
        dayDone: false,
        partial: true,
        tasks: res.tasks,
        text: ILM_TEXTS[(key + new Date().getDate()) % ILM_TEXTS.length],
        key,
      });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ — حاول مرة أخرى');
      return false;
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(item.id);
        return next;
      });
    }
  };

  const saveNote = async (item: MyLearningItem, note: string | null) => {
    try {
      await api(`/learning/items/${item.id}/note`, { method: 'PUT', body: { note } });
      patch(item.id, { note });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ الفائدة');
      return false;
    }
  };

  if (!data) return error ? <p className="text-sm text-danger">{error}</p> : <Spinner full />;
  if (!data.enrollment?.active) return <Invite data={data} onChoose={(a) => void choose(a)} busy={busy} />;

  const card = (i: MyLearningItem, showDate = false) => (
    <LessonCard key={i.id} item={i} today={today} busy={pending.has(i.id)} onToggle={(it, d) => void toggle(it, d)} onPart={part} onNote={saveNote} showDate={showDate} />
  );
  const todays = byDay.get(today) ?? [];
  const catchUp = data.items.filter((i) => i.date < today && !i.done && i.worth !== null);
  const upcomingDays = [...byDay.keys()].filter((d) => d > today).sort().slice(0, 3);
  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-6">
      <JourneyProgress stats={data.stats} />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <section aria-labelledby="today-lesson" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-lesson" className="font-display text-[20px] font-semibold text-fg">
            درس اليوم
          </h2>
          <span className="text-xs text-muted">
            {gregorianLong(today)} · {hijriDate(today)}
          </span>
        </div>

        {bushra && (
          <div key={bushra.key} role="status" className="bushra-in rounded-xl border border-accent/40 bg-accent-soft px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 font-display text-sm text-accent">
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                {(bushra.partial
                  ? bushra.points > 0
                    ? `سُجّل ما أنجزته من «${bushra.title}» (+${arNumber.format(bushra.points)} نقطة) — بارك الله في وقتك`
                    : `حُفظ موضعك في «${bushra.title}» — أكمله متى تيسّر لك`
                  : bushra.dayDone
                    ? `أتممت درس اليوم — (+${arNumber.format(bushra.points)} نقطة) زادك الله علمًا`
                    : bushra.madeUp
                      ? `تداركت «${bushra.title}» (+${arNumber.format(bushra.points)} نقطة) — والعودة خير`
                      : `بُشراك — أتممت «${bushra.title}» (+${arNumber.format(bushra.points)} نقطة)`) + tasksNote(bushra.tasks)}
              </p>
              <button type="button" onClick={() => setBushra(null)} aria-label="إغلاق" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface">
                <X className="h-4 w-4" />
              </button>
            </div>
            <FadlText text={bushra.text} className="mt-1.5" />
          </div>
        )}

        {data.restDay || isRestDay(today) ? (
          <RestCard />
        ) : todays.length ? (
          todays.map((i) => card(i))
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-2 font-display text-lg text-fg">لا درس في التقويم اليوم</p>
            <p className="mt-1 text-sm text-muted">{catchUp.length ? 'فرصة لتدارك ما فاتك.' : 'راجع فوائدك، وتهيّأ لما بعده.'}</p>
          </div>
        )}
      </section>

      {catchUp.length > 0 && (
        <section aria-labelledby="catch-up" className="space-y-3">
          <h2 id="catch-up" className="flex flex-wrap items-baseline justify-between gap-2 font-display text-[18px] font-semibold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <History className="h-5 w-5 text-warn" aria-hidden="true" />
              تدارك ما فاتك
            </span>
            <span className="text-xs font-normal text-muted">بنقاطه كاملة في اليوم التالي، وبنصفها خلال الأسبوع</span>
          </h2>
          {catchUp.map((i) => card(i, true))}
        </section>
      )}

      <JourneyMap
        month={month}
        onMonth={(by) => {
          setMonth((m) => shiftMonth(m, by));
          setSelected(null);
        }}
        itemsByDay={byDay}
        today={today}
        startDay={data.enrollment.startDay}
        selected={selected}
        onSelect={(d) => setSelected((s) => (s === d ? null : d))}
      />

      {selected && selected !== today && (
        <section aria-label={gregorianLong(selected)} className="space-y-3">
          <h2 className="font-display text-[17px] text-fg-2">
            {gregorianLong(selected)} · {hijriDate(selected)}
          </h2>
          {isRestDay(selected) ? (
            <p className="text-sm text-muted">الجمعة — يوم الاستجمام.</p>
          ) : selectedItems.length ? (
            selectedItems.map((i) => card(i))
          ) : (
            <p className="text-sm text-muted">لا درس في هذا اليوم.</p>
          )}
        </section>
      )}

      {upcomingDays.length > 0 && (
        <section className="card px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-1.5 border-b border-line pb-2 font-display text-[18px] font-semibold">
            <CalendarClock className="h-5 w-5 text-accent" aria-hidden="true" />
            تهيّأ لما بعده
          </h2>
          <ul className="divide-y divide-line">
            {upcomingDays.map((d) => (
              <li key={d} className="py-2.5">
                <p className="text-xs text-muted">{gregorianLong(d)}</p>
                {(byDay.get(d) ?? []).map((i) => {
                  const Icon = KINDS[i.kind].icon;
                  return (
                    <p key={i.id} className="mt-0.5 flex items-start gap-1.5 font-display text-[15px] text-fg">
                      <Icon className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>
                        {i.title}
                        {i.portion && <span className="ms-1.5 text-sm text-accent">({i.portion})</span>}
                      </span>
                    </p>
                  );
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.stats.lastDay && data.stats.lastDay < today && (
        <p className="text-center text-sm text-muted">بلغت آخر ما وُضع في التقويم ({lessonsLabel(data.stats.total)}) — ستُضاف الدروس القادمة قريبًا بإذن الله.</p>
      )}

      <div className="border-t border-line pt-4 text-center">
        {leaving ? (
          <div className="mx-auto max-w-md rounded-xl border border-line bg-surface-2/50 px-4 py-3">
            <p className="text-sm leading-7 text-fg-2">تغادر الرحلة؟ يبقى كل ما أتممته محفوظًا، وتعود متى شئت.</p>
            <div className="mt-2 flex justify-center gap-2">
              <button type="button" className="btn-outline !min-h-10 !text-sm" disabled={busy} onClick={() => void choose(false)}>
                مغادرة الرحلة
              </button>
              <button type="button" className="btn-primary !min-h-10 !text-sm" onClick={() => setLeaving(false)}>
                أبقى معكم
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setLeaving(true)} className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted hover:text-fg">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            مغادرة الرحلة
          </button>
        )}
      </div>
    </div>
  );
}
