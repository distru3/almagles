import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { TaskProgress as Progress } from '../../lib/types';
import { WEEKDAY_NAMES, addDays, hijriDate, toISODate, todayISO, weekdayKey } from '../../lib/dates';
import Avatar from '../Avatar';
import Spinner from '../Spinner';
import { REPEAT_LABELS } from './TaskChecklist';

const arNumber = new Intl.NumberFormat('ar');
const shift = (iso: string, days: number) => toISODate(addDays(new Date(`${iso}T12:00:00`), days));

/**
 * Admins and schedule managers: who has done which task on a day. Daily tasks
 * count that day; weekly tasks count that day's Saturday→Friday week.
 */
export default function TaskProgress() {
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [query, setQuery] = useState('');
  const today = todayISO();

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    api<Progress>(`/tasks/progress?date=${date}`)
      .then((res) => live && setData(res))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل المتابعة'));
    return () => {
      live = false;
    };
  }, [date]);

  const members = useMemo(() => {
    if (!data) return [];
    const q = query.trim();
    return data.members
      .filter((m) => !q || m.name.includes(q))
      .filter((m) => !onlyMissing || m.done.length < data.tasks.length)
      .sort((a, b) => b.done.length - a.done.length || a.name.localeCompare(b.name, 'ar'));
  }, [data, query, onlyMissing]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm text-accent">{date === today ? 'اليوم' : WEEKDAY_NAMES[weekdayKey(new Date(`${date}T12:00:00`))]}</p>
          <p className="font-display text-[20px] font-semibold">{hijriDate(date)}</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setDate(shift(date, -1))} aria-label="اليوم السابق" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong hover:border-accent hover:text-accent">
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onClick={() => setDate(today)} disabled={date === today} className="h-11 rounded-full border border-line-strong px-4 font-display text-sm hover:border-accent hover:text-accent disabled:opacity-50">
            اليوم
          </button>
          <button type="button" onClick={() => setDate(shift(date, 1))} disabled={date >= today} aria-label="اليوم التالي" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong hover:border-accent hover:text-accent disabled:opacity-40">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{error}</p>
      ) : !data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.tasks.length === 0 ? (
        <p className="py-10 text-center text-muted">لا توجد مهام لمتابعتها — أضفها من «إدارة المهام».</p>
      ) : (
        <>
          {/* Per-task totals */}
          <ul className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.tasks.map((t) => {
              const pct = data.members.length ? Math.round((t.doneCount / data.members.length) * 100) : 0;
              return (
                <li key={t.id} className="rounded-sm border border-line bg-surface p-3.5">
                  <p className="truncate font-display text-[15px] font-semibold" title={t.title}>
                    {t.title}
                  </p>
                  <p className="text-xs text-muted">{REPEAT_LABELS[t.repeat]}</p>
                  <p className="mt-2 font-display text-[22px] font-bold text-accent">
                    {arNumber.format(t.doneCount)}
                    <span className="text-sm font-normal text-muted"> من {arNumber.format(data.members.length)}</span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent-fill" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="sr-only" htmlFor="progress-search">
              بحث عن عضو
            </label>
            <input id="progress-search" className="input !h-10 !py-1.5 sm:max-w-xs" placeholder="بحث عن عضو…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-2">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              من لم يُتمّ مهامه فقط
            </label>
          </div>

          {/* Member × task grid */}
          <div className="overflow-x-auto rounded-sm border border-line bg-surface">
            <table className="w-full min-w-[520px] text-[15px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 font-display text-[13px] text-muted">
                  <th scope="col" className="px-4 py-2.5 text-start font-normal">
                    العضو
                  </th>
                  {data.tasks.map((t) => (
                    <th key={t.id} scope="col" className="max-w-[9rem] px-2 py-2.5 text-center font-normal" title={t.title}>
                      <span className="line-clamp-2">{t.title}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2.5 text-center font-normal">
                    المنجز
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((m) => {
                  const done = new Set(m.done);
                  return (
                    <tr key={m.id}>
                      <th scope="row" className="px-4 py-2 text-start font-normal">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                          <span className="truncate">{m.name}</span>
                        </span>
                      </th>
                      {data.tasks.map((t) => (
                        <td key={t.id} className="px-2 py-2 text-center">
                          {done.has(t.id) ? (
                            <Check className="mx-auto h-5 w-5 text-success" strokeWidth={3} aria-label="أنجزها" />
                          ) : (
                            <Minus className="mx-auto h-4 w-4 text-line-strong" aria-label="لم ينجزها" />
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center font-display tabular-nums text-fg-2">
                        {arNumber.format(m.done.length)}/{arNumber.format(data.tasks.length)}
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={data.tasks.length + 2} className="px-4 py-6 text-center text-sm text-muted">
                      لا يوجد أعضاء مطابقون.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
