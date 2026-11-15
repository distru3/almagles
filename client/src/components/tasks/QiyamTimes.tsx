import { useId, useMemo, useState } from 'react';
import { LocateFixed, MapPin, MoonStar } from 'lucide-react';
import { CITIES, METHODS, cityPlace, formatClock, nightOf, savePlace, type MethodId, type Place } from '../../lib/prayerTimes';

/**
 * Tonight's qiyam window for the member's city: from Isha to Fajr, with the
 * last third marked. The night may start on one date and end on the next —
 * it's always the night that began on the evening of `day`.
 */
export default function QiyamTimes({ day, place, onPlace }: { day: string; place: Place; onPlace: (p: Place) => void }) {
  const [editing, setEditing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const night = useMemo(() => nightOf(day, place), [day, place]);
  const uid = useId();
  const now = Date.now();
  const inLastThird = now >= night.lastThird.getTime() && now < night.fajr.getTime();

  const choose = (p: Place) => {
    savePlace(p);
    onPlace(p);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('متصفحك لا يدعم تحديد الموقع');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        choose({ cityId: null, label: 'موقعي الحالي', lat: pos.coords.latitude, lng: pos.coords.longitude, method: place.method });
      },
      () => {
        setLocating(false);
        setGeoError('تعذّر تحديد موقعك — اختر مدينتك من القائمة');
      },
      { timeout: 10_000, maximumAge: 86_400_000 },
    );
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
      {editing && (
        <div className="mt-2 grid gap-2 border-t border-line pt-2 sm:grid-cols-2">
          <div>
            <label className="label !text-xs" htmlFor={`city-${uid}`}>
              المدينة
            </label>
            <select
              id={`city-${uid}`}
              className="input !h-10 !py-1"
              value={place.cityId ?? ''}
              onChange={(e) => {
                const city = CITIES.find((c) => c.id === e.target.value);
                if (city) choose(cityPlace(city));
              }}
            >
              {place.cityId === null && <option value="">موقعي الحالي</option>}
              {[...new Set(CITIES.map((c) => c.country))].map((country) => (
                <optgroup key={country} label={country}>
                  {CITIES.filter((c) => c.country === country).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label !text-xs" htmlFor={`method-${uid}`}>
              طريقة الحساب
            </label>
            <select id={`method-${uid}`} className="input !h-10 !py-1" value={place.method} onChange={(e) => choose({ ...place, method: e.target.value as MethodId })}>
              {(Object.keys(METHODS) as MethodId[]).map((m) => (
                <option key={m} value={m}>
                  {METHODS[m].name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center gap-1.5 text-accent hover:text-accent-strong disabled:opacity-60">
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
              {locating ? 'جارٍ تحديد موقعك…' : 'استخدم موقعي الحالي'}
            </button>
            {geoError && <p className="mt-1 text-danger">{geoError}</p>}
            <p className="mt-1 text-muted">المواقيت محسوبة فلكيًا وقد تختلف دقيقة أو دقيقتين — والعبرة بتقويم بلدك ومسجدك.</p>
          </div>
        </div>
      )}
    </div>
  );
}
