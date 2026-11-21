import { PAGE_STARTS, SURA_AYAS } from './quranMeta.js';

/**
 * «المصحف»: checking a place in the mushaf and finding its page. The numbers
 * come from Tanzil's metadata via quranMeta.ts (generated — see
 * client/scripts/quran-pages.mjs); the text itself is never on the server.
 */

/** Whether `aya` exists in `sura` (1–114). */
export function isAyah(sura: number, aya: number): boolean {
  return Number.isInteger(sura) && Number.isInteger(aya) && sura >= 1 && sura <= SURA_AYAS.length && aya >= 1 && aya <= SURA_AYAS[sura - 1];
}

/** The Madinah page (1–604) that `sura:aya` is on. */
export function pageOf(sura: number, aya: number): number {
  const key = sura * 1000 + aya;
  let lo = 0;
  let hi = PAGE_STARTS.length - 1;
  // The last page whose first ayah is at or before this one.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const [s, a] = PAGE_STARTS[mid];
    if (s * 1000 + a <= key) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
