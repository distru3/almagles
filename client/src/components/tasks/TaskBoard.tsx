import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Flame, GraduationCap, HandHeart, HeartHandshake, ListChecks, Sparkles, Trophy } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { BoardMember, TaskBoard as Board } from '../../lib/types';
import { addDays, dateTime, dateTimeTitle, toISODate, todayISO } from '../../lib/dates';
import { BUNYAN, COMPETE, FADAIL, GUIDE, LA_YAMALL, RACE } from '../../lib/fadail';
import { BADGES, levelOf } from '../../lib/rewards';
import { lessonsLabel } from '../../lib/learning';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../Avatar';
import Spinner from '../Spinner';
import FadlText from './FadlText';
import CommunityPulse from './CommunityPulse';

const arNumber = new Intl.NumberFormat('ar');

function daysLabel(n: number): string {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} أيام`;
  return `${arNumber.format(n)} يومًا`;
}

/** ﴿يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ﴾, from the texts on «طلب العلم». */
const RAISE = FADAIL.find((f) => f.id === 'ilm')?.texts.find((t) => t.kind === 'ayah') ?? COMPETE;

/** The race can be read whole, or in worship or in «طلب العلم» alone. */
type Race = 'all' | 'ibada' | 'ilm';
const RACES: { key: Race; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'ibada', label: 'العبادة' },
  { key: 'ilm', label: 'طلب العلم' },
];
const weekIn = (m: BoardMember, race: Race) => (race === 'all' ? m.week : race === 'ilm' ? m.ilmWeek : m.week - m.ilmWeek);
const totalIn = (m: BoardMember, race: Race) => (race === 'all' ? m.total : race === 'ilm' ? m.ilmTotal : m.total - m.ilmTotal);

/**
 * This week's points, split: worship in gold, «طلب العلم» in ink — so the
 * member sees both fields of the garden growing.
 */
function WeekSplit({ me }: { me: Pick<BoardMember, 'week' | 'ilmWeek' | 'lessons' | 'ilmStreak'> }) {
  const ibada = me.week - me.ilmWeek;
  const whole = Math.max(1, me.week);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full bg-accent-fill transition-[width] duration-500" style={{ width: `${(ibada / whole) * 100}%` }} />
        <div className="h-full bg-ilm-fill transition-[width] duration-500" style={{ width: `${(me.ilmWeek / whole) * 100}%` }} />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-fill" aria-hidden="true" />
          العبادة هذا الأسبوع: <span className="font-display text-accent">{arNumber.format(ibada)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ilm-fill" aria-hidden="true" />
          طلب العلم: <span className="font-display text-ilm">{arNumber.format(me.ilmWeek)}</span>
        </span>
        {me.ilmStreak > 0 ? (
          <span className="inline-flex items-center gap-1 text-ilm">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            سلسلة العلم {daysLabel(me.ilmStreak)}
          </span>
        ) : (
          <Link to="/learn" className="text-ilm hover:underline">
            {me.lessons ? 'درس اليوم في «رحلة العلم»' : 'ازرع حقل العلم أيضًا — «رحلة العلم»'}
          </Link>
        )}
      </p>
    </div>
  );
}

export function useBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setBoard(await api<Board>(`/tasks/board?date=${todayISO()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل الساحة');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { board, error, reload: load };
}

function Badges({ ids, size = 'sm' }: { ids: BoardMember['badges']; size?: 'sm' | 'lg' }) {
  if (ids.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => {
        const b = BADGES[id];
        const Icon = b.icon;
        return size === 'lg' ? (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs text-accent" title={b.hint}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {b.name}
          </span>
        ) : (
          <span key={id} title={`${b.name} — ${b.hint}`} className="text-accent">
            <Icon className="h-4 w-4" aria-label={b.name} />
          </span>
        );
      })}
    </span>
  );
}

/** Away for two days or more, with no excuse: «إخوانٌ نفتقدهم», and the welcome back. */
export function isAway(m: Pick<BoardMember, 'lastDay' | 'total'>): boolean {
  return m.total > 0 && m.lastDay !== null && m.lastDay <= toISODate(addDays(new Date(), -2));
}

/**
 * A word for the member before their garden: a warm welcome back after time
 * away (with the bonus waiting for them), or — when today is still empty —
 * a gentle «don't break your streak».
 */
function Encouragement({ me }: { me: BoardMember }) {
  if (isAway(me)) {
    return (
      <div className="mb-4 rounded-sm border border-accent/40 bg-accent-soft px-4 py-3">
        <p className="flex items-center gap-2 font-display text-[16px] text-accent">
          <HeartHandshake className="h-5 w-5" aria-hidden="true" />
          اشتقنا إليك — مرحبًا بعودتك
        </p>
        <FadlText text={LA_YAMALL} className="mt-1.5" />
        <p className="mt-1 text-xs leading-6 text-muted">
          لا يهمّ ما فات؛ ابدأ الآن بمهمة واحدة ولك هدية العودة (+٥ نقاط)، وما فاتك في الأيام الثلاثة الأخيرة تجده في «تدارك ما فاتك».
        </p>
      </div>
    );
  }
  if (me.streak > 0 && me.today === 0 && !me.excusedToday) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-sm border border-warn/40 bg-warn-soft/50 px-4 py-3">
        <Flame className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-sm leading-7">
          <span className="font-display text-warn">أدرك سلسلتك: </span>
          {daysLabel(me.streak)} على العمل — مهمة واحدة اليوم تحفظها. «أحبّ الأعمال إلى الله أدومها وإن قلّ».
        </p>
      </div>
    );
  }
  return null;
}

/** «بستاني»: the member's own level, points, streak and badges. */
export function MyGarden({ me }: { me: BoardMember | undefined }) {
  const stats = me ?? { total: 0, week: 0, streak: 0, bestStreak: 0, ilmWeek: 0, lessons: 0, ilmStreak: 0, badges: [] as BoardMember['badges'] };
  const { level, next, progress } = levelOf(stats.total);
  const Icon = level.icon;
  return (
    <>
      {me && <Encouragement me={me} />}
      <section className="mb-5 rounded-sm border border-line bg-surface px-4 py-4 sm:px-5" aria-label="بستاني">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">بستانك</p>
            <p className="font-display text-[20px] font-bold">
              {level.name}
              <span className="ms-2 text-sm font-normal text-muted">{arNumber.format(stats.total)} نقطة</span>
            </p>
            {next && (
              <>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <div className="h-full rounded-full bg-accent-fill transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {arNumber.format(next.min - stats.total)} نقطة حتى تصير «{next.name}»
                </p>
              </>
            )}
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className={`flex items-center justify-center gap-1 font-display text-[20px] font-bold ${stats.streak ? 'text-warn' : 'text-muted'}`}>
                <Flame className="h-5 w-5" aria-hidden="true" />
                {arNumber.format(stats.streak)}
              </p>
              <p className="text-xs text-muted">أيام متتالية</p>
            </div>
            <div>
              <p className="font-display text-[20px] font-bold text-accent">{arNumber.format(stats.week)}</p>
              <p className="text-xs text-muted">نقاط الأسبوع</p>
            </div>
          </div>
        </div>
        <WeekSplit me={stats} />
        {stats.badges.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <Badges ids={stats.badges} size="lg" />
          </div>
        )}
        <p className="mt-3 border-t border-line pt-2 text-xs leading-6 text-muted">
          {stats.streak > 0
            ? `ثبّتك الله — ${daysLabel(stats.streak)} على العمل. «أحبّ الأعمال إلى الله أدومها وإن قلّ».`
            : '«أحبّ الأعمال إلى الله أدومها وإن قلّ» — ابدأ اليوم ولو بمهمة واحدة.'}{' '}
          النقاط للتشجيع فقط، والأجر عند الله.
        </p>
      </section>
    </>
  );
}

/** «ذكّره بلطف»: one tap sends a kind reminder; the server limits how often. */
function NudgeButton({ member }: { member: BoardMember }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const send = async () => {
    setState('busy');
    setMessage(null);
    try {
      await api(`/tasks/nudge/${member.id}`, { method: 'POST' });
      setState('sent');
    } catch (err) {
      setState(err instanceof ApiError && err.status === 429 ? 'sent' : 'idle');
      setMessage(err instanceof ApiError ? err.message : 'تعذّر الإرسال');
    }
  };
  return (
    <span className="text-end">
      {state === 'sent' && !message ? (
        <span className="inline-flex items-center gap-1 text-sm text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          ذكّرته
        </span>
      ) : (
        <button type="button" onClick={() => void send()} disabled={state !== 'idle'} className="btn-outline !min-h-9 !px-3 !text-sm">
          <HeartHandshake className="h-4 w-4" aria-hidden="true" />
          ذكّره بلطف
        </button>
      )}
      {message && <span className="mt-0.5 block text-xs text-muted">{message}</span>}
    </span>
  );
}

const RANK_STYLES = ['bg-accent-fill text-on-accent', 'bg-accent-soft text-accent', 'bg-surface-2 text-accent'];

/**
 * «ساحة الهمّة», for every member: this week's standings, who was first
 * today, and what the others have just done — so each encourages the rest.
 */
export default function TaskBoard() {
  const { user } = useAuth();
  const { board, error } = useBoard();
  // «رحلة العلم» links here with ?race=ilm, to open on the race in learning.
  const [params] = useSearchParams();
  const [race, setRace] = useState<Race>(() => RACES.find((r) => r.key === params.get('race'))?.key ?? 'all');

  if (error) return <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{error}</p>;
  if (!board) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  const me = board.members.find((m) => m.id === user?.id);
  const ranked = board.members
    .filter((m) => totalIn(m, race) > 0)
    .sort((a, b) => weekIn(b, race) - weekIn(a, race) || totalIn(b, race) - totalIn(a, race) || a.name.localeCompare(b.name, 'ar'));
  const away = board.members.filter((m) => m.id !== user?.id && isAway(m) && !m.excusedToday);

  return (
    <div className="space-y-5">
      <MyGarden me={me} />

      <div className="rounded-sm border border-line bg-surface-2/40 px-4 py-3 text-center">
        <FadlText text={race === 'ilm' ? RAISE : COMPETE} />
        <p className="mt-1 text-xs text-muted">
          {race === 'ilm'
            ? 'سباقٌ في طلب العلم: درسٌ كل يوم — فأخلص النية، واجعل العلم للعمل.'
            : 'تنافسٌ في الخير، عبادةً وعلمًا، يشدّ بعضنا بعضًا — فأخلص النية، ولا تجعل النقاط غايتك.'}
        </p>
      </div>

      {board.first && (
        <div className="flex items-center gap-3 rounded-sm border border-accent/40 bg-accent-soft px-4 py-3">
          <Sparkles className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-display text-accent">السبّاق اليوم: </span>
            {board.first.id === user?.id ? 'أنت' : board.first.name} — أول من أنجز مهمة اليوم
            <span className="ms-1 text-xs text-muted">{RACE.text}</span>
          </p>
        </div>
      )}

      {board.firstIlm && (
        <div className="flex items-center gap-3 rounded-sm border border-ilm/40 bg-ilm-soft px-4 py-3">
          <GraduationCap className="h-5 w-5 shrink-0 text-ilm" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-display text-ilm">السبّاق إلى العلم اليوم: </span>
            {board.firstIlm.id === user?.id ? 'أنت' : board.firstIlm.name} — أول من أتمّ درس اليوم
            <Link to="/learn" className="ms-2 text-xs text-ilm hover:underline">
              درس اليوم
            </Link>
          </p>
        </div>
      )}

      {/* This week's standings */}
      <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
        <h2 className="flex items-center justify-between gap-3 border-b border-line pb-2 font-display text-[18px] font-semibold">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent" aria-hidden="true" />
            ترتيب هذا الأسبوع
          </span>
          <span className="text-xs font-normal text-muted">يبدأ كل سبت</span>
        </h2>
        <div role="tablist" aria-label="ميدان السباق" className="mt-2.5 flex flex-wrap gap-1.5">
          {RACES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={race === key}
              onClick={() => setRace(key)}
              className={`min-h-9 rounded-full px-3.5 font-display text-sm transition ${
                race === key ? (key === 'ilm' ? 'bg-ilm-fill text-on-accent' : 'bg-accent-fill text-on-accent') : 'border border-line text-fg-2 hover:border-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {ranked.length === 0 ? (
          race === 'ilm' ? (
            <p className="py-6 text-center text-sm text-muted">
              لم يُتمّ أحد درسًا بعد —{' '}
              <Link to="/learn" className="text-ilm hover:underline">
                كن أول السابقين في «رحلة العلم»
              </Link>
            </p>
          ) : (
            <p className="py-6 text-center text-sm text-muted">لم يُنجز أحد مهمة بعد — كن أول السابقين.</p>
          )
        ) : (
          <ol className="divide-y divide-line">
            {ranked.map((m, i) => {
              const { level } = levelOf(m.total);
              const LevelIcon = level.icon;
              const isMe = m.id === user?.id;
              return (
                <li key={m.id} className={`flex items-center gap-3 py-2.5 ${isMe ? '-mx-2 rounded bg-accent-soft/60 px-2' : ''}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm ${RANK_STYLES[i] ?? 'text-muted'}`}>
                    {arNumber.format(i + 1)}
                  </span>
                  <Link to={`/u/${m.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
                    <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-display text-[15px]">
                      <Link to={`/u/${m.id}`} className="truncate hover:text-accent">
                        {isMe ? `${m.name} (أنت)` : m.name}
                      </Link>
                      <Badges ids={m.badges} />
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1" title={`المستوى: ${level.name}`}>
                        <LevelIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                        {level.name}
                      </span>
                      {race === 'ilm'
                        ? m.ilmStreak > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-ilm" title="سلسلة العلم">
                              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                              {daysLabel(m.ilmStreak)}
                            </span>
                          )
                        : m.streak > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-warn" title="أيام متتالية">
                              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                              {daysLabel(m.streak)}
                            </span>
                          )}
                      {race === 'all' && m.ilmWeek > 0 && (
                        <span>
                          عبادة {arNumber.format(m.week - m.ilmWeek)} · <span className="text-ilm">علم {arNumber.format(m.ilmWeek)}</span>
                        </span>
                      )}
                      {race === 'ilm' && <span>{lessonsLabel(m.lessons)}</span>}
                      {m.today > 0 && <span>اليوم: {arNumber.format(m.today)}</span>}
                      {m.excusedToday && (
                        <span className="inline-flex items-center gap-0.5" title="معذور اليوم — سلسلته محفوظة">
                          <HandHeart className="h-3.5 w-3.5" aria-hidden="true" />
                          معذور
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-end font-display">
                    <span className={`block text-[18px] font-bold tabular-nums ${race === 'ilm' ? 'text-ilm' : 'text-accent'}`}>{arNumber.format(weekIn(m, race))}</span>
                    <span className="block text-[11px] text-muted">هذا الأسبوع</span>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <CommunityPulse />

      {/* Brothers who've been away: one tap to remind them kindly */}
      {away.length > 0 && (
        <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 border-b border-line pb-2 font-display text-[18px] font-semibold">
            <HeartHandshake className="h-5 w-5 text-accent" aria-hidden="true" />
            إخوانٌ نفتقدهم
          </h2>
          <div className="mt-2 text-sm">
            <FadlText text={BUNYAN} />
            <p className="mt-1 text-xs text-muted">غابوا عن المهام يومين أو أكثر — ذكّرهم بلطف، وادعُ لهم بظهر الغيب.</p>
          </div>
          <ul className="mt-1 divide-y divide-line">
            {away.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Link to={`/u/${m.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                </Link>
                <p className="min-w-0 flex-1 truncate font-display text-[15px]">
                  <Link to={`/u/${m.id}`} className="hover:text-accent">
                    {m.name}
                  </Link>
                </p>
                <NudgeButton member={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What the others just did */}
      {board.recent.length > 0 && (
        <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
          <h2 className="border-b border-line pb-2 font-display text-[18px] font-semibold">أنجز إخوانك مؤخرًا</h2>
          <ul className="divide-y divide-line">
            {board.recent.map((r) => (
              <li key={`${r.userId}-${r.at}`} className="flex items-center gap-2.5 py-2 text-sm">
                <Link to={`/u/${r.userId}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
                  <Avatar name={r.name} src={r.avatarUrl} size="xs" />
                </Link>
                {r.learning ? (
                  <GraduationCap className="h-4 w-4 shrink-0 text-ilm" aria-label="طلب العلم" />
                ) : (
                  <ListChecks className="h-4 w-4 shrink-0 text-accent" aria-label="عبادة" />
                )}
                <p className="min-w-0 flex-1">
                  <Link to={`/u/${r.userId}`} className="font-display hover:text-accent">
                    {r.userId === user?.id ? 'أنت' : r.name}
                  </Link>
                  <span className="text-fg-2">
                    {' '}
                    · {r.learning ? (r.madeUp ? `تدارك درس «${r.title}»` : `درس «${r.title}»`) : r.madeUp ? `تدارك «${r.title}»` : r.title}
                  </span>
                  <span className={`ms-1 text-xs ${r.learning ? 'text-ilm' : 'text-accent'}`}>+{arNumber.format(r.points)}</span>
                </p>
                <time dateTime={r.at} title={dateTimeTitle(r.at)} className="shrink-0 text-xs text-muted">
                  {dateTime(r.at)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="text-center">
        <FadlText text={GUIDE} />
        <p className="mt-1 text-xs text-muted">ادعُ إخوانك إلى المهام — لك مثل أجرهم.</p>
      </div>
    </div>
  );
}
