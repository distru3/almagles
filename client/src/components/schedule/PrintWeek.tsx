import type { ScheduleColumn, ScheduleItem } from '../../lib/types';
import { WEEKDAY_NAMES, weekdayKey, hijriShort, hijriDate, gregorianShort } from '../../lib/dates';
import { weekDates, linkText } from '../../lib/schedule';
import { normalizeUrl } from '../../lib/url';
import Logo from '../Logo';

/**
 * Fixed-width, always-light layout of one week, captured into the PDF.
 * Rows carry data-pdf-row so page breaks fall between sessions.
 */
export default function PrintWeek({
  weekKey,
  items,
  columns,
}: {
  weekKey: string;
  items: ScheduleItem[];
  columns: ScheduleColumn[];
}) {
  const days = weekDates(weekKey);
  const cell = 'border border-line-strong px-2.5 py-2 align-top';

  return (
    <div dir="rtl" className="theme-light w-[1062px] bg-surface p-6 font-sans text-[13px] leading-[1.7] text-fg">
      <div className="mb-4 flex items-end justify-between border-b-2 border-accent-fill pb-3">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7 text-accent" />
          <div>
            <p className="font-display text-[22px] font-bold leading-tight">رجال الأمة</p>
            <p className="text-[13px] text-muted">المقرر الأسبوعي</p>
          </div>
        </div>
        <div className="text-left">
          <p className="font-display text-[16px] text-accent">
            {hijriShort(days[0])} – {hijriDate(days[6])}
          </p>
          <p className="text-[12px] text-muted">
            {gregorianShort(days[0])} – {gregorianShort(days[6])}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr data-pdf-row className="bg-surface-2 font-display text-[13px]">
            <th className={`${cell} w-[110px] text-right`}>اليوم</th>
            <th className={`${cell} w-[80px] text-right`}>الوقت</th>
            <th className={`${cell} w-[130px] text-right`}>القسم</th>
            <th className={`${cell} text-right`}>العنوان</th>
            <th className={`${cell} text-right`}>ملاحظات</th>
            {columns.map((c) => (
              <th key={c.id} className={`${cell} w-[110px] text-right`}>
                {c.label}
              </th>
            ))}
            <th className={`${cell} w-[150px] text-right`}>الرابط</th>
          </tr>
        </thead>
        <tbody>
          {days.map((iso) => {
            const dayItems = items.filter((i) => i.date === iso);
            const dayCell = (
              <td className={`${cell} bg-surface-2/60`} rowSpan={Math.max(1, dayItems.length)}>
                <p className="font-display text-[14px]">{WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))]}</p>
                <p className="text-[11px] text-muted">{hijriShort(iso)}</p>
              </td>
            );
            if (dayItems.length === 0) {
              return (
                <tr key={iso} data-pdf-row>
                  {dayCell}
                  <td className={`${cell} text-muted`} colSpan={5 + columns.length}>
                    —
                  </td>
                </tr>
              );
            }
            return dayItems.map((i, idx) => (
              <tr key={i.id} data-pdf-row>
                {idx === 0 && dayCell}
                <td className={cell}>{i.timeLabel}</td>
                <td className={cell}>{i.section}</td>
                <td className={`${cell} font-semibold`}>{i.title}</td>
                <td className={`${cell} whitespace-pre-line`}>{i.notes}</td>
                {columns.map((c) => (
                  <td key={c.id} className={cell}>
                    {i.customValues?.[c.id]}
                  </td>
                ))}
                <td className={cell}>
                  {i.linkUrl && (
                    <a href={normalizeUrl(i.linkUrl)} className="text-accent underline">
                      {linkText(i)}
                      <span className="block break-all text-[10px] text-muted no-underline">{i.linkUrl}</span>
                    </a>
                  )}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
