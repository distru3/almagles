import { useMemo, useState } from 'react';
import { MapPin, MoonStar } from 'lucide-react';
import { METHODS, formatClock, nightOf, type Place } from '../../lib/prayerTimes';
import { syncAdhkarPlace } from '../../lib/adhkarReminders';
import PlacePicker from '../PlacePicker';

/**
 * Tonight's qiyam window for the member's city: from Isha to Fajr, with the
 * last third marked. The night may start on one date and end on the next —
 * it's always the night that began on the evening of `day`.
 */
export default function QiyamTimes({ day, place, onPlace }: { day: string; place: Place; onPlace: (p: Place) => void }) {
  const [editing, setEditing] = useState(false);
  const night = useMemo(() => nightOf(day, place), [day, place]);
  const now = Date.now();
  const inLastThird = now >= night.lastThird.getTime() && now < night.fajr.getTime();

  // The adhkar reminders follow the same city, so tell the server too.
  const choose = (p: Place) => {
    onPlace(p);
    void syncAdhkarPlace(p);
  };

  const steps = [
    { label: 'العشاء', at: night.isha },
    { label: 'منتصف الليل', at: night.midnight },
    { label: 'الثلث الأخير', at: night.lastThird, best: true },
    { label: 'الفجر', at: night.fajr },
  ];

  return (
    <div className="mt-2 rounded-sm border border-line bg-surface-2/50 px-3 py-2.5 text-sm">
      <p className="flex items-center gap-1.5 font-display text-fg-2">
        <MoonStar className="h-4 w-4 text-accent" aria-hidden="true" />
        {inLastThird ? 'أنت الآن في الثلث الأخير من الليل — وقت النزول الإلهي' : 'وقت القيام الليلة'}
      </p>
      <ol className="mt-2 grid grid-cols-4 gap-1 text-center">
        {steps.map((s) => (
          <li key={s.label} className={`rounded px-1 py-1 ${s.best ? 'bg-accent-soft text-accent' : ''}`}>
            <span className="block text-[11px] text-muted">{s.label}</span>
            <span className="font-display tabular-nums">{formatClock(s.at)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {place.label} · {METHODS[place.method].name}
        </span>
        <button type="button" onClick={() => setEditing((e) => !e)} className="text-accent hover:text-accent-strong">
          {editing ? 'تم' : 'تغيير المدينة'}
        </button>
      </div>
      {editing && <PlacePicker place={place} onPlace={choose} />}
    </div>
  );
}
