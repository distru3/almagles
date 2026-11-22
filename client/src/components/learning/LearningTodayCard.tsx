import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, Coffee, GraduationCap } from 'lucide-react';
import { api } from '../../lib/api';
import type { LearningJourney } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { KINDS, arNumber, daysLabel } from '../../lib/learning';

/**
 * «درس اليوم» at the top of «مهامي»: today's lessons of «رحلة العلم» and a
 * way into them. For a member who hasn't decided yet, a quiet invitation;
 * for one who declined, nothing at all.
 */
export default function LearningTodayCard() {
  const [data, setData] = useState<LearningJourney | null>(null);

  useEffect(() => {
    let active = true;
    const today = todayISO();
    api<LearningJourney>(`/learning?date=${today}&from=${today}&to=${today}`)
      .then((res) => active && setData(res))
      .catch(() => {
        /* the tasks page works without it */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!data || data.enrollment?.active === false) return null;

  if (!data.enrollment) {
    return (
      <Link to="/learn" className="mb-5 flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3 transition hover:border-accent">
        <GraduationCap className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm leading-6 text-fg-2">
          <span className="font-display text-fg">رحلة العلم</span> — درس كل يوم مع إخوانك، والجمعة استجمام. تعرّف عليها إن شئت.
        </span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    );
  }

  const todays = data.items.filter((i) => i.date === data.today);
  const done = todays.filter((i) => i.done).length;
  const allDone = todays.length > 0 && done === todays.length;
  return (
    <Link to="/learn" className={`card mb-5 block px-4 py-3 transition hover:border-accent sm:px-5 ${allDone ? '!border-accent/40' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${allDone ? 'bg-accent-fill text-on-accent' : 'bg-accent-soft text-accent'}`} aria-hidden="true">
          {allDone ? <Check className="h-5 w-5" strokeWidth={3} /> : data.restDay ? <Coffee className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 font-display text-[16px] text-fg">
            درس اليوم
            {data.stats.streak > 0 && <span className="text-xs text-accent">سلسلة {daysLabel(data.stats.streak)}</span>}
          </p>
          {data.restDay ? (
            <p className="text-sm text-muted">الجمعة يوم الاستجمام — نلتقي غدًا على درس جديد.</p>
          ) : todays.length === 0 ? (
            <p className="text-sm text-muted">لا درس في التقويم اليوم.</p>
          ) : (
            <ul className="text-sm leading-6">
              {todays.map((i) => {
                const Icon = KINDS[i.kind].icon;
                return (
                  <li key={i.id} className={`flex items-center gap-1.5 ${i.done ? 'text-muted line-through decoration-1' : 'text-fg-2'}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="truncate">
                      {i.title}
                      {i.portion && ` (${i.portion})`}
                    </span>
                    {!i.done && <span className="shrink-0 text-xs text-accent">{arNumber.format(i.points)} نقطة</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
    </Link>
  );
}
