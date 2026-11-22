import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MyLearningItem } from '../../lib/types';
import { WEEK_HEAD, dayNumber, dayState, hijriMonthLabel, monthGrid, monthLabel, type DayState } from '../../lib/learning';

const CELL: Record<DayState, string> = {
  done: 'bg-accent-fill text-on-accent',
  partial: 'bg-accent-soft text-accent',
  today: 'border-2 border-accent text-fg font-bold',
  open: 'border border-dashed border-warn text-warn',
  missed: 'text-muted',
  upcoming: 'border border-line text-fg',
  rest: 'bg-surface-2/70 text-muted',
  empty: 'text-muted/70',
  before: 'text-muted/70',
};

const LABEL: Record<DayState, string> = {
  done: 'أتممته',
  partial: 'أتممت بعضه',
  today: 'درس اليوم',
  open: 'فاتك ويمكن تداركه',
  missed: 'فاتك',
  upcoming: 'قادم',
  rest: 'الجمعة — يوم الاستجمام',
  empty: 'لا درس',
  before: 'قبل انضمامك',
};

const LEGEND: DayState[] = ['done', 'partial', 'today', 'open', 'upcoming', 'rest'];

/**
 * «خريطة الرحلة»: the month, Saturday first, each day coloured by what the
 * member did with its lessons. Tapping a day shows its lessons below.
 */
export default function JourneyMap({
  month,
  onMonth,
  itemsByDay,
  today,
  startDay,
  selected,
  onSelect,
}: {
  month: string;
  onMonth: (by: number) => void;
  itemsByDay: Map<string, MyLearningItem[]>;
  today: string;
  startDay: string | null;
  selected: string | null;
  onSelect: (day: string) => void;
}) {
  return (
    <section aria-label="خريطة الرحلة" className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <button type="button" onClick={() => onMonth(-1)} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2" aria-label="الشهر السابق">
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h2 className="font-display text-[18px] font-semibold text-fg">{monthLabel(month)}</h2>
          <p className="text-xs text-muted">{hijriMonthLabel(month)}</p>
        </div>
        <button type="button" onClick={() => onMonth(1)} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2" aria-label="الشهر التالي">
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

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
            {week.map((day, j) => {
              if (!day) return <span key={j} />;
              const items = itemsByDay.get(day) ?? [];
              const state = dayState(day, items, today, startDay);
              const isSelected = day === selected;
              return (
                <span key={day}>
                  <button
                    type="button"
                    onClick={() => onSelect(day)}
                    aria-pressed={isSelected}
                    aria-label={`${dayNumber(day)} — ${LABEL[state]}`}
                    title={LABEL[state]}
                    className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-xl font-display text-sm transition sm:text-base ${CELL[state]} ${
                      isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:opacity-85'
                    }`}
                  >
                    {dayNumber(day)}
                    {state === 'upcoming' && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />}
                    {state === 'missed' && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
        {LEGEND.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3.5 w-3.5 rounded ${CELL[s]}`} aria-hidden="true" />
            {LABEL[s]}
          </li>
        ))}
      </ul>
    </section>
  );
}
