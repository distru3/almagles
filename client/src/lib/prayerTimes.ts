/**
 * Maghrib, Isha and Fajr for «قيام الليل», worked out from the sun's position
 * (the usual astronomical method, as in PrayTimes.org) for the member's city
 * and their country's calculation method. Accurate to a minute or two — the
 * local mosque's timetable always wins.
 */

export type MethodId = 'egypt' | 'makkah' | 'mwl' | 'kuwait' | 'qatar' | 'gulf' | 'morocco' | 'algeria' | 'tunisia' | 'jordan';

interface Method {
  name: string;
  fajr: number;
  /** Isha by the sun's depression angle, or a number of minutes after Maghrib. */
  isha: { angle: number } | { minutes: number };
}

export const METHODS: Record<MethodId, Method> = {
  egypt: { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: { angle: 17.5 } },
  makkah: { name: 'أم القرى (السعودية)', fajr: 18.5, isha: { minutes: 90 } },
  mwl: { name: 'رابطة العالم الإسلامي', fajr: 18, isha: { angle: 17 } },
  kuwait: { name: 'الكويت', fajr: 18, isha: { angle: 17.5 } },
  qatar: { name: 'قطر', fajr: 18, isha: { minutes: 90 } },
  gulf: { name: 'الإمارات', fajr: 18.2, isha: { angle: 18.2 } },
  morocco: { name: 'وزارة الأوقاف المغربية', fajr: 19, isha: { angle: 17 } },
  algeria: { name: 'الجزائر', fajr: 18, isha: { angle: 17 } },
  tunisia: { name: 'تونس', fajr: 18, isha: { angle: 18 } },
  jordan: { name: 'الأردن', fajr: 18, isha: { angle: 18 } },
};

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  method: MethodId;
  /** IANA zones that suggest this city when the member hasn't chosen one. */
  zones?: string[];
}

export const CITIES: City[] = [
  { id: 'cairo', name: 'القاهرة', country: 'مصر', lat: 30.0444, lng: 31.2357, method: 'egypt', zones: ['Africa/Cairo'] },
  { id: 'alexandria', name: 'الإسكندرية', country: 'مصر', lat: 31.2001, lng: 29.9187, method: 'egypt' },
  { id: 'mansoura', name: 'المنصورة', country: 'مصر', lat: 31.0409, lng: 31.3785, method: 'egypt' },
  { id: 'assiut', name: 'أسيوط', country: 'مصر', lat: 27.1783, lng: 31.1859, method: 'egypt' },
  { id: 'aswan', name: 'أسوان', country: 'مصر', lat: 24.0889, lng: 32.8998, method: 'egypt' },
  { id: 'makkah', name: 'مكة المكرمة', country: 'السعودية', lat: 21.3891, lng: 39.8579, method: 'makkah' },
  { id: 'madinah', name: 'المدينة المنورة', country: 'السعودية', lat: 24.5247, lng: 39.5692, method: 'makkah' },
  { id: 'riyadh', name: 'الرياض', country: 'السعودية', lat: 24.7136, lng: 46.6753, method: 'makkah', zones: ['Asia/Riyadh'] },
  { id: 'jeddah', name: 'جدة', country: 'السعودية', lat: 21.4858, lng: 39.1925, method: 'makkah' },
  { id: 'dammam', name: 'الدمام', country: 'السعودية', lat: 26.4207, lng: 50.0888, method: 'makkah' },
  { id: 'dubai', name: 'دبي', country: 'الإمارات', lat: 25.2048, lng: 55.2708, method: 'gulf', zones: ['Asia/Dubai'] },
  { id: 'abudhabi', name: 'أبوظبي', country: 'الإمارات', lat: 24.4539, lng: 54.3773, method: 'gulf' },
  { id: 'kuwait', name: 'الكويت', country: 'الكويت', lat: 29.3759, lng: 47.9774, method: 'kuwait', zones: ['Asia/Kuwait'] },
  { id: 'doha', name: 'الدوحة', country: 'قطر', lat: 25.2854, lng: 51.531, method: 'qatar', zones: ['Asia/Qatar'] },
  { id: 'manama', name: 'المنامة', country: 'البحرين', lat: 26.2285, lng: 50.586, method: 'mwl', zones: ['Asia/Bahrain'] },
  { id: 'muscat', name: 'مسقط', country: 'عُمان', lat: 23.588, lng: 58.3829, method: 'mwl', zones: ['Asia/Muscat'] },
  { id: 'amman', name: 'عمّان', country: 'الأردن', lat: 31.9539, lng: 35.9106, method: 'jordan', zones: ['Asia/Amman'] },
  { id: 'quds', name: 'القدس', country: 'فلسطين', lat: 31.7683, lng: 35.2137, method: 'mwl', zones: ['Asia/Jerusalem', 'Asia/Hebron'] },
  { id: 'gaza', name: 'غزة', country: 'فلسطين', lat: 31.5017, lng: 34.4668, method: 'mwl', zones: ['Asia/Gaza'] },
  { id: 'damascus', name: 'دمشق', country: 'سوريا', lat: 33.5138, lng: 36.2765, method: 'mwl', zones: ['Asia/Damascus'] },
  { id: 'aleppo', name: 'حلب', country: 'سوريا', lat: 36.2021, lng: 37.1343, method: 'mwl' },
  { id: 'beirut', name: 'بيروت', country: 'لبنان', lat: 33.8938, lng: 35.5018, method: 'mwl', zones: ['Asia/Beirut'] },
  { id: 'baghdad', name: 'بغداد', country: 'العراق', lat: 33.3152, lng: 44.3661, method: 'mwl', zones: ['Asia/Baghdad'] },
  { id: 'basra', name: 'البصرة', country: 'العراق', lat: 30.5085, lng: 47.7804, method: 'mwl' },
  { id: 'sanaa', name: 'صنعاء', country: 'اليمن', lat: 15.3694, lng: 44.191, method: 'mwl', zones: ['Asia/Aden'] },
  { id: 'aden', name: 'عدن', country: 'اليمن', lat: 12.7855, lng: 45.0187, method: 'mwl' },
  { id: 'khartoum', name: 'الخرطوم', country: 'السودان', lat: 15.5007, lng: 32.5599, method: 'egypt', zones: ['Africa/Khartoum'] },
  { id: 'tripoli', name: 'طرابلس', country: 'ليبيا', lat: 32.8872, lng: 13.1913, method: 'mwl', zones: ['Africa/Tripoli'] },
  { id: 'tunis', name: 'تونس', country: 'تونس', lat: 36.8065, lng: 10.1815, method: 'tunisia', zones: ['Africa/Tunis'] },
  { id: 'algiers', name: 'الجزائر', country: 'الجزائر', lat: 36.7538, lng: 3.0588, method: 'algeria', zones: ['Africa/Algiers'] },
  { id: 'oran', name: 'وهران', country: 'الجزائر', lat: 35.6971, lng: -0.6308, method: 'algeria' },
  { id: 'casablanca', name: 'الدار البيضاء', country: 'المغرب', lat: 33.5731, lng: -7.5898, method: 'morocco', zones: ['Africa/Casablanca'] },
  { id: 'rabat', name: 'الرباط', country: 'المغرب', lat: 34.0209, lng: -6.8416, method: 'morocco' },
  { id: 'fes', name: 'فاس', country: 'المغرب', lat: 34.0181, lng: -5.0078, method: 'morocco' },
  { id: 'marrakech', name: 'مراكش', country: 'المغرب', lat: 31.6295, lng: -7.9811, method: 'morocco' },
  { id: 'tangier', name: 'طنجة', country: 'المغرب', lat: 35.7595, lng: -5.834, method: 'morocco' },
  { id: 'nouakchott', name: 'نواكشوط', country: 'موريتانيا', lat: 18.0735, lng: -15.9582, method: 'mwl', zones: ['Africa/Nouakchott'] },
  { id: 'mogadishu', name: 'مقديشو', country: 'الصومال', lat: 2.0469, lng: 45.3182, method: 'mwl', zones: ['Africa/Mogadishu'] },
  { id: 'djibouti', name: 'جيبوتي', country: 'جيبوتي', lat: 11.588, lng: 43.145, method: 'mwl', zones: ['Africa/Djibouti'] },
];

/** Where the member prays: a listed city, or their own coordinates. */
export interface Place {
  cityId: string | null;
  label: string;
  lat: number;
  lng: number;
  method: MethodId;
}

const STORAGE_KEY = 'prayer-place';

export function cityPlace(city: City): Place {
  return { cityId: city.id, label: `${city.name}، ${city.country}`, lat: city.lat, lng: city.lng, method: city.method };
}

/** The member's chosen place, else a guess from their time zone, else Cairo. */
export function loadPlace(): Place {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Place | null;
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && saved.method in METHODS) return saved;
  } catch {
    /* storage blocked or corrupt — fall through to a guess */
  }
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* ignore */
  }
  return cityPlace(CITIES.find((c) => c.zones?.includes(zone)) ?? CITIES[0]);
}

export function savePlace(place: Place): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch {
    /* not saved on this device — still used for this visit */
  }
}

// ------------------------------------------------------------ astronomy

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => ((a % b) + b) % b;

function julian(y: number, m: number, d: number): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

/** The sun's declination and the equation of time at Julian date `jd`. */
function sun(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - ra };
}

export interface DayTimes {
  fajr: Date;
  maghrib: Date;
  isha: Date;
}

/** Fajr, Maghrib and Isha on the civil date `iso` ("2026-11-15") at `place`. */
export function prayerTimes(iso: string, place: Place): DayTimes {
  const [y, m, d] = iso.split('-').map(Number);
  const method = METHODS[place.method];
  const jd = julian(y, m, d) - place.lng / (15 * 24);
  const lat = rad(place.lat);

  /** Hours (local solar time) when the sun is `angle`° below the horizon, before or after noon. */
  const at = (angle: number, guess: number, before: boolean) => {
    let t = guess;
    for (let i = 0; i < 2; i++) {
      const { decl, eqt } = sun(jd + t / 24);
      const noon = fix(12 - eqt, 24);
      const cos = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(lat)) / (Math.cos(rad(decl)) * Math.cos(lat));
      const span = deg(Math.acos(Math.min(1, Math.max(-1, cos)))) / 15;
      t = noon + (before ? -span : span);
    }
    return t;
  };

  const fajr = at(method.fajr, 5, true);
  const maghrib = at(0.833, 18, false);
  const isha = 'angle' in method.isha ? at(method.isha.angle, 18, false) : maghrib + method.isha.minutes / 60;
  // Local solar hours → an instant: subtract the longitude's offset from UTC.
  const base = Date.UTC(y, m - 1, d);
  const toDate = (h: number) => new Date(base + Math.round((h - place.lng / 15) * 60) * 60_000);
  return { fajr: toDate(fajr), maghrib: toDate(maghrib), isha: toDate(isha) };
}

export interface Night {
  maghrib: Date;
  isha: Date;
  /** Halfway between Maghrib and Fajr. */
  midnight: Date;
  /** The start of the night's last third — the best time for qiyam. */
  lastThird: Date;
  fajr: Date;
}

/** The night that begins on the evening of `iso` and ends at the next day's Fajr. */
export function nightOf(iso: string, place: Place): Night {
  const evening = prayerTimes(iso, place);
  const next = new Date(`${iso}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const { fajr } = prayerTimes(next.toISOString().slice(0, 10), place);
  const length = fajr.getTime() - evening.maghrib.getTime();
  return {
    maghrib: evening.maghrib,
    isha: evening.isha,
    midnight: new Date(evening.maghrib.getTime() + length / 2),
    lastThird: new Date(evening.maghrib.getTime() + (length * 2) / 3),
    fajr,
  };
}

const clock = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' });
export const formatClock = (d: Date) => clock.format(d);
