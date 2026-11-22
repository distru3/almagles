import { Link } from 'react-router-dom';
import { BookCheck, Flame, Gem, Target, Trophy } from 'lucide-react';
import type { LearningJourney } from '../../lib/types';
import { arNumber, daysLabel, lessonsLabel, milestone } from '../../lib/learning';

const percent = new Intl.NumberFormat('ar', { style: 'percent', maximumFractionDigits: 0 });

/** The share of the journey walked, as a thin gold ring. */
function Ring({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-surface-2" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="text-accent transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-black text-fg">{percent.format(value)}</span>
        <span className="text-[11px] text-muted">من الرحلة</span>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Flame; label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 font-display text-xs text-fg-2">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-0.5 font-display text-xl font-bold text-fg">{value}</p>
      {hint && <p className="text-[11px] leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Where the member stands: the share of the journey done, «سلسلة العلم»,
 * how faithfully they've kept the lessons since joining, and their points —
 * with a warm word for the stage they've reached.
 */
export default function JourneyProgress({ stats }: { stats: LearningJourney['stats'] }) {
  const share = stats.total ? stats.done / stats.total : 0;
  const kept = stats.due ? stats.keptDue / stats.due : 0;
  return (
    <section aria-label="تقدّمي في الرحلة" className="card p-4 sm:p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <Ring value={share} />
        <div className="w-full min-w-0 flex-1">
          <p className="text-center font-display text-[17px] leading-8 text-fg sm:text-start">{milestone(stats)}</p>
          <p className="text-center text-sm text-muted sm:text-start">
            أتممت {lessonsLabel(stats.done)} من {lessonsLabel(stats.total)} في الرحلة
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat
              icon={Flame}
              label="سلسلة العلم"
              value={stats.streak ? daysLabel(stats.streak) : '—'}
              hint={stats.bestStreak > stats.streak ? `أطولها ${daysLabel(stats.bestStreak)}` : 'الجمعة لا تقطعها'}
            />
            <Stat icon={Target} label="مواظبتي" value={stats.due ? percent.format(kept) : '—'} hint={stats.due ? `${arNumber.format(stats.keptDue)} من ${arNumber.format(stats.due)} منذ انضممت` : 'تبدأ بدرس اليوم'} />
            <Stat icon={BookCheck} label="دروس أتممتها" value={arNumber.format(stats.done)} hint={stats.madeUp ? `منها ${arNumber.format(stats.madeUp)} تداركًا` : undefined} />
            <Stat
              icon={Gem}
              label="نقاط العلم"
              value={arNumber.format(stats.points)}
              hint={
                <Link to="/tasks?tab=board&race=ilm" className="text-ilm hover:underline">
                  تُحسب في «ساحة الهمّة»
                </Link>
              }
            />
          </div>
          <Link
            to="/tasks?tab=board&race=ilm"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-ilm/40 bg-ilm-soft px-4 py-2 font-display text-sm text-ilm transition hover:border-ilm sm:justify-start"
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
            ترتيبك في سباق طلب العلم هذا الأسبوع
          </Link>
        </div>
      </div>
    </section>
  );
}
