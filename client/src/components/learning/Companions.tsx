import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Flame, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { LearningCompanions } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { BUNYAN } from '../../lib/fadail';
import { arNumber, daysLabel, lessonsLabel } from '../../lib/learning';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../Avatar';
import Spinner from '../Spinner';
import EmptyState from '../EmptyState';
import FadlText from '../tasks/FadlText';

/** «أتمّ درس اليوم ٤ من ١٢ رفيقًا». */
function todayLine(done: number, of: number): string {
  if (of === 1) return done ? 'أتمّ رفيقك درس اليوم' : 'رفيق واحد في الرحلة';
  return `أتمّ درس اليوم ${arNumber.format(done)} من ${arNumber.format(of)}`;
}

/**
 * «رفقاء الرحلة»: everyone on the journey, how far they've come and whether
 * they've done today's lesson — to walk it together. Nobody is ranked as
 * "behind"; the order is simply by lessons done.
 */
export default function Companions() {
  const { user } = useAuth();
  const [data, setData] = useState<LearningCompanions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<LearningCompanions>(`/learning/companions?date=${todayISO()}`)
      .then((res) => active && setData(res))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل رفقاء الرحلة'));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <Spinner full />;
  if (data.members.length === 0) {
    return <EmptyState icon={Users} title="لم ينضم أحد بعد" description="كن أول السالكين، وادعُ إخوانك إليها." />;
  }

  const doneToday = data.todayCount ? data.members.filter((m) => m.todayDone >= data.todayCount).length : 0;
  return (
    <div className="space-y-5">
      <section className="card px-4 py-3 sm:px-5">
        <h2 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 font-display text-[18px] font-semibold">
          رفقاء الرحلة
          <span className="text-xs font-normal text-muted">
            {data.todayCount ? todayLine(doneToday, data.members.length) : `${arNumber.format(data.members.length)} في الرحلة`}
          </span>
        </h2>
        <ul className="divide-y divide-line">
          {data.members.map((m) => {
            const share = data.total ? m.done / data.total : 0;
            const finishedToday = data.todayCount > 0 && m.todayDone >= data.todayCount;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Link to={`/u/${m.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/u/${m.id}`} className="font-display text-fg hover:text-accent">
                      {m.id === user?.id ? 'أنت' : m.name}
                    </Link>
                    {finishedToday && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] leading-5 text-success">
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                        أتمّ درس اليوم
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent-fill" style={{ width: `${share * 100}%` }} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>{lessonsLabel(m.done)}</span>
                    {m.streak > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3 w-3 text-accent" aria-hidden="true" />
                        {daysLabel(m.streak)}
                      </span>
                    )}
                    <span>{arNumber.format(m.points)} نقطة</span>
                    {m.week > 0 && <span className="text-ilm">+{arNumber.format(m.week)} هذا الأسبوع</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="text-center">
        <FadlText text={BUNYAN} />
        <Link to="/tasks?tab=board&race=ilm" className="mt-2 inline-flex min-h-10 items-center font-display text-sm text-ilm hover:underline">
          سباق طلب العلم في «ساحة الهمّة»
        </Link>
      </div>
    </div>
  );
}
