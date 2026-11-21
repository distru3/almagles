// Builds «المصحف» from Tanzil's files in client/quran/ (the master copies — never edit them):
//   quran-uthmani.txt  Tanzil Quran Text (Uthmani, v1.1): "sura|aya|text" per line, then its notice
//   quran-data.xml     Tanzil metadata: surahs, the 604 Madinah pages, juz', sajdas
// into
//   public/quran/index.json        surahs, juz' and the notice
//   public/quran/pages/001…604.json  the ayat of each page, exactly as in the text
//   ../server/src/lib/quranMeta.ts  ayat per surah and page starts, for checking bookmarks
//
// Run from client/:  node scripts/quran-pages.mjs  (dev and build run it first).
// It stops before writing anything if a fingerprint, a count, or a split doesn't hold.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const SRC = new URL('../quran/', import.meta.url);
const OUT = new URL('../public/quran/', import.meta.url);
const SERVER_META = new URL('../../server/src/lib/quranMeta.ts', import.meta.url);

// The verified downloads. If Tanzil publishes an update, replace the file whole and update its fingerprint here.
const FINGERPRINTS = {
  'quran-uthmani.txt': '7f30c647331a61100ebf24a80507dc0fcdd9f2df97f1312b5b2dfcb982a7f326',
  'quran-data.xml': '8867c1d88191472adec9db694b3cd9f135b1a2ef580574d32cf888dcb22c5c7a',
};

const fail = (msg) => {
  console.error(`quran-pages: ${msg}`);
  process.exit(1);
};

const files = {};
for (const [name, sha] of Object.entries(FINGERPRINTS)) {
  const bytes = await readFile(new URL(name, SRC));
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== sha) fail(`${name} has changed (sha256 ${got}). It must stay exactly as downloaded from tanzil.net.`);
  files[name] = bytes.toString('utf8');
}

// ---- the text
const lines = files['quran-uthmani.txt'].split(/\r?\n/);
const ayat = [];
for (const line of lines) {
  const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
  if (m) ayat.push({ s: Number(m[1]), a: Number(m[2]), t: m[3] });
}
// Tanzil's notice, which their terms ask to keep with anything made from the text.
const notice = lines.filter((l) => l.startsWith('#')).map((l) => l.replace(/^#\s?/, '').trimEnd());
if (!notice.some((l) => l.includes('Tanzil Project'))) fail('the Tanzil notice is missing from the text file');
if (ayat.length !== 6236) fail(`expected 6236 ayat, found ${ayat.length}`);

// ---- the metadata
const xml = files['quran-data.xml'];
const tags = (tag) =>
  [...xml.matchAll(new RegExp(`<${tag} ([^>]*)/>`, 'g'))].map((m) => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
const suras = tags('sura').map((s) => ({ n: +s.index, name: s.name, ayas: +s.ayas, type: s.type === 'Meccan' ? 'مكية' : 'مدنية' }));
const pageStarts = tags('page').map((p) => [+p.sura, +p.aya]);
const juzStarts = tags('juz').map((j) => [+j.sura, +j.aya]);
if (suras.length !== 114 || pageStarts.length !== 604 || juzStarts.length !== 30) fail('unexpected metadata counts');

const ayasOf = new Map();
for (const x of ayat) ayasOf.set(x.s, Math.max(ayasOf.get(x.s) ?? 0, x.a));
for (const s of suras) if (ayasOf.get(s.n) !== s.ayas) fail(`surah ${s.n}: metadata says ${s.ayas} ayat, the text has ${ayasOf.get(s.n)}`);

const key = (s, a) => s * 1000 + a;
const pageOf = (s, a) => {
  let n = 1;
  for (let i = 0; i < pageStarts.length; i++) if (key(...pageStarts[i]) <= key(s, a)) n = i + 1;
  return n;
};
const juzOf = (s, a) => {
  let n = 1;
  for (let i = 0; i < juzStarts.length; i++) if (key(...juzStarts[i]) <= key(s, a)) n = i + 1;
  return n;
};

// ---- the basmala, shown as its own line above each surah but al-Fatiha (where it is ayah 1) and at-Tawba (none).
// The text keeps it at the start of ayah 1; we only split the string, and prove nothing changed.
const plain = (w) => w.replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[ٱأإآ]/g, 'ا');
const BASMALA = ['بسم', 'الله', 'الرحمن', 'الرحيم'];
for (const x of ayat) {
  if (x.a !== 1 || x.s === 1 || x.s === 9) continue;
  const words = x.t.split(' ');
  if (!BASMALA.every((w, i) => plain(words[i] ?? '') === w)) fail(`surah ${x.s} doesn't open with the basmala as expected`);
  x.b = words.slice(0, 4).join(' ');
  x.t = words.slice(4).join(' ');
  if (`${x.b} ${x.t}` !== words.join(' ') || !x.t) fail(`surah ${x.s}: splitting the basmala would change the text`);
}

// ---- write
const SOURCE = 'Tanzil Quran Text (Uthmani, Version 1.1) — Copyright (C) 2007-2026 Tanzil Project — CC BY 3.0 — verbatim, unchanged — https://tanzil.net';
// Only files whose content changed are written, so a running dev server isn't churned on every run.
await mkdir(new URL('pages/', OUT), { recursive: true });
const writeIfChanged = async (url, content) => {
  const before = await readFile(url, 'utf8').catch(() => null);
  if (before !== content) await writeFile(url, content);
};
const expected = new Set(Array.from({ length: 604 }, (_, i) => `${String(i + 1).padStart(3, '0')}.json`));
for (const name of await readdir(new URL('pages/', OUT))) if (!expected.has(name)) await rm(new URL(`pages/${name}`, OUT));

const byPage = Array.from({ length: 604 }, () => []);
for (const x of ayat) byPage[pageOf(x.s, x.a) - 1].push(x);
for (let i = 0; i < 604; i++) {
  const list = byPage[i];
  if (list.length === 0) fail(`page ${i + 1} is empty`);
  const page = { page: i + 1, juz: juzOf(list[0].s, list[0].a), source: SOURCE, ayat: list };
  await writeIfChanged(new URL(`pages/${String(i + 1).padStart(3, '0')}.json`, OUT), JSON.stringify(page));
}

const index = {
  source: SOURCE,
  notice,
  pages: 604,
  suras: suras.map((s) => ({ ...s, page: pageOf(s.n, 1) })),
  juzs: juzStarts.map(([s, a], i) => ({ n: i + 1, s, a, page: pageOf(s, a) })),
};
await writeIfChanged(new URL('index.json', OUT), JSON.stringify(index));
await writeIfChanged(new URL('NOTICE.txt', OUT), `${notice.join('\n')}\n`);

const meta = `// Generated by client/scripts/quran-pages.mjs from Tanzil's metadata (client/quran/) — do not edit.
// Numbers only: how many ayat each surah has, and where each of the 604 Madinah pages begins.

/** Ayat in each surah; index 0 is al-Fatiha. */
export const SURA_AYAS: readonly number[] = ${JSON.stringify(suras.map((s) => s.ayas))};

/** [surah, ayah] where each page begins; index 0 is page 1. */
export const PAGE_STARTS: readonly (readonly [number, number])[] = ${JSON.stringify(pageStarts)};
`;
const previous = await readFile(SERVER_META, 'utf8').catch(() => '');
if (previous !== meta) await writeFile(SERVER_META, meta);

console.log(`quran-pages: ${ayat.length} ayat in ${suras.length} surahs on 604 pages, verified against Tanzil.`);
