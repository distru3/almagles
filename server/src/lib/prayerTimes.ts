/**
 * Fajr, Asr, Maghrib and Isha from the sun's position for a member's place —
 * the server's copy of `client/src/lib/prayerTimes.ts` (keep the astronomy in
 * step). The server needs it so «تنبيهات أوقات الأذكار» can follow Fajr and Asr
 * where the member actually is, even while their browser is closed.
 */

export const METHOD_IDS = ['egypt', 'makkah', 'mwl', 'kuwait', 'qatar', 'gulf', 'morocco', 'algeria', 'tunisia', 'jordan'] as const;
export type MethodId = (typeof METHOD_IDS)[number];

interface Method {
  fajr: number;
  /** Isha by the sun's depression angle, or a number of minutes after Maghrib. */
  isha: { angle: number } | { minutes: number };
}

const METHODS: Record<MethodId, Method> = {
  egypt: { fajr: 19.5, isha: { angle: 17.5 } },
  makkah: { fajr: 18.5, isha: { minutes: 90 } },
  mwl: { fajr: 18, isha: { angle: 17 } },
  kuwait: { fajr: 18, isha: { angle: 17.5 } },
  qatar: { fajr: 18, isha: { minutes: 90 } },
  gulf: { fajr: 18.2, isha: { angle: 18.2 } },
  morocco: { fajr: 19, isha: { angle: 17 } },
  algeria: { fajr: 18, isha: { angle: 17 } },
  tunisia: { fajr: 18, isha: { angle: 18 } },
  jordan: { fajr: 18, isha: { angle: 18 } },
};

export function isMethodId(m: unknown): m is MethodId {
  return typeof m === 'string' && (METHOD_IDS as readonly string[]).includes(m);
}

export interface PrayerPlace {
  lat: number;
  lng: number;
  method: MethodId;
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
  asr: Date;
  maghrib: Date;
  isha: Date;
}

/** Fajr, Asr, Maghrib and Isha on the civil date `iso` ("2026-11-15") at `place`. */
export function prayerTimes(iso: string, place: PrayerPlace): DayTimes {
  const [y, m, d] = iso.split('-').map(Number);
  const method = METHODS[place.method];
  const jd = julian(y, m, d) - place.lng / (15 * 24);
  const lat = rad(place.lat);

  /** Hours (local solar time) when the sun is `angle`° below the horizon (negative: above), before or after noon. */
  const at = (angle: number | ((decl: number) => number), guess: number, before: boolean) => {
    let t = guess;
    for (let i = 0; i < 2; i++) {
      const { decl, eqt } = sun(jd + t / 24);
      const a = typeof angle === 'number' ? angle : angle(decl);
      const noon = fix(12 - eqt, 24);
      const cos = (-Math.sin(rad(a)) - Math.sin(rad(decl)) * Math.sin(lat)) / (Math.cos(rad(decl)) * Math.cos(lat));
      const span = deg(Math.acos(Math.min(1, Math.max(-1, cos)))) / 15;
      t = noon + (before ? -span : span);
    }
    return t;
  };

  const fajr = at(method.fajr, 5, true);
  // Asr: an object's shadow equals its length plus its noon shadow (the majority's reckoning).
  const asr = at((decl) => -deg(Math.atan(1 / (1 + Math.tan(Math.abs(lat - rad(decl)))))), 15, false);
  const maghrib = at(0.833, 18, false);
  const isha = 'angle' in method.isha ? at(method.isha.angle, 18, false) : maghrib + method.isha.minutes / 60;
  // Local solar hours → an instant: subtract the longitude's offset from UTC.
  const base = Date.UTC(y, m - 1, d);
  const toDate = (h: number) => new Date(base + Math.round((h - place.lng / 15) * 60) * 60_000);
  return { fajr: toDate(fajr), asr: toDate(asr), maghrib: toDate(maghrib), isha: toDate(isha) };
}
