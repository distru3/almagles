import { useId, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { CITIES, METHODS, cityPlace, savePlace, type MethodId, type Place } from '../lib/prayerTimes';

/**
 * Choose where the member prays: a listed city, the device's location, and the
 * calculation method. Shared by «وقت القيام» on the tasks page and
 * «تنبيهات أوقات الأذكار», so both follow the same city on this device.
 */
export default function PlacePicker({ place, onPlace }: { place: Place; onPlace: (p: Place) => void }) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const uid = useId();

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

  return (
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
  );
}
