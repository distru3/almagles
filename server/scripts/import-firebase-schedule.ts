/**
 * Import the weekly schedule from the old almagles-schedule app (Firebase
 * Realtime Database) into this site's database.
 *
 * Safe to re-run: sessions and columns are matched by their Firebase ids
 * (`sourceId`), so a second run updates instead of duplicating. Without
 * --apply nothing is written — the run only reports what would change.
 *
 *   npm run import:schedule -w server                 # dry run
 *   npm run import:schedule -w server -- --apply      # write
 *
 * Options (with --apply):
 *   --replace-overlaps  delete sessions created on this site (not imported)
 *                       on dates the import covers, so days aren't doubled
 *   --prune             delete previously imported sessions that no longer
 *                       exist in Firebase
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const SOURCE_URL =
  process.env.FIREBASE_SCHEDULE_URL ??
  'https://almagles-98aac-default-rtdb.europe-west1.firebasedatabase.app/schedule.json';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const REPLACE_OVERLAPS = args.has('--replace-overlaps');
const PRUNE = args.has('--prune');

interface FirebaseRow {
  id: string;
  date: string;
  time: string;
  section: string;
  title: string;
  notes: string;
  linkUrl: string;
  linkLabel: string;
  customValues: Record<string, string>;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Single-line fields: the old app allowed line breaks inside them. */
const line = (v: unknown) => str(v).replace(/\s+/g, ' ');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

function weekdayKeyOf(iso: string): string {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

function isValidDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Same rules as the API: http(s) or a same-site path; bare hosts get https://. */
function normalizeLink(url: string): string | null {
  if (!url) return null;
  const internal = url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
  const full = internal || /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^[/\\]+/, '')}`;
  if (internal) return full;
  try {
    const u = new URL(full);
    return u.protocol === 'http:' || u.protocol === 'https:' ? full : null;
  } catch {
    return null;
  }
}

async function fetchSource() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Firebase responded ${res.status}`);
  const payload = (await res.json()) as Record<string, unknown> | null;
  if (!payload) throw new Error('Firebase returned no schedule');

  const columns = list(payload.columns)
    .map((c) => c as Record<string, unknown>)
    .filter((c) => typeof c?.id === 'string' && str(c.label))
    .map((c) => ({ id: c.id as string, label: str(c.label) }));

  const rows: FirebaseRow[] = list(payload.rows)
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r?.id === 'string')
    .map((r) => ({
      id: r.id as string,
      date: str(r.date),
      time: line(r.time),
      section: line(r.section),
      title: line(r.title),
      notes: str(r.notes),
      linkUrl: str(r.linkUrl),
      linkLabel: line(r.linkLabel),
      customValues: Object.fromEntries(
        Object.entries((r.customValues as Record<string, unknown>) ?? {})
          .map(([k, v]) => [k, str(v)] as const)
          .filter(([, v]) => v !== ''),
      ),
    }));
  return { columns, rows };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Source: ${SOURCE_URL}`);
    console.log(APPLY ? 'Mode: APPLY (writing)\n' : 'Mode: dry run (nothing is written; add --apply to import)\n');

    const { columns, rows } = await fetchSource();

    // Columns: match by Firebase id.
    const columnIdMap = new Map<string, string>();
    for (const [order, col] of columns.entries()) {
      const existing = await prisma.scheduleColumn.findUnique({ where: { sourceId: col.id } });
      if (existing) {
        columnIdMap.set(col.id, existing.id);
        if (existing.label !== col.label) {
          console.log(`  column renamed: «${existing.label}» → «${col.label}»`);
          if (APPLY) await prisma.scheduleColumn.update({ where: { id: existing.id }, data: { label: col.label } });
        }
      } else {
        console.log(`  new column: «${col.label}»`);
        if (APPLY) {
          const created = await prisma.scheduleColumn.create({ data: { label: col.label, order, sourceId: col.id } });
          columnIdMap.set(col.id, created.id);
        } else {
          columnIdMap.set(col.id, `(new:${col.label})`);
        }
      }
    }

    // Rows: skip only ones the site can't place (no valid date) or that are
    // completely empty. The old app allowed sessions without a title; the
    // site requires one, so borrow it from the section or the notes.
    const skipped: string[] = [];
    const titled: string[] = [];
    const importable = rows.filter((r) => {
      const hasContent =
        r.title || r.time || r.section || r.notes || r.linkUrl || Object.keys(r.customValues).length > 0;
      if (!hasContent) {
        skipped.push(`${r.id}: empty session (${r.date || 'no date'})`);
        return false;
      }
      if (!isValidDate(r.date)) {
        skipped.push(`${r.id}: missing/invalid date «${r.date}» (${r.title || r.section || 'no title'})`);
        return false;
      }
      if (!r.title) {
        r.title = r.section || line(r.notes.split('\n')[0]) || 'جلسة';
        titled.push(`${r.date}: title taken from ${r.section ? 'section' : 'notes'} → «${r.title}»`);
      }
      return true;
    });

    // Keep the Firebase order within each day.
    const orderInDay = new Map<string, number>();
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const badLinks: string[] = [];

    for (const r of importable) {
      const sortOrder = orderInDay.get(r.date) ?? 0;
      orderInDay.set(r.date, sortOrder + 1);
      const linkUrl = normalizeLink(r.linkUrl);
      if (r.linkUrl && !linkUrl) badLinks.push(`${r.date} «${r.title}»: ${r.linkUrl}`);
      const customValues = Object.fromEntries(
        Object.entries(r.customValues)
          .filter(([k]) => columnIdMap.has(k))
          .map(([k, v]) => [columnIdMap.get(k)!, v]),
      );
      const data = {
        date: r.date,
        weekdayKey: weekdayKeyOf(r.date),
        timeLabel: r.time,
        section: r.section || null,
        title: r.title,
        notes: r.notes || null,
        linkUrl,
        linkLabel: linkUrl ? r.linkLabel || null : null,
        customValues,
        sortOrder,
      };

      const existing = await prisma.scheduleItem.findUnique({ where: { sourceId: r.id } });
      if (!existing) {
        created++;
        if (APPLY) await prisma.scheduleItem.create({ data: { ...data, sourceId: r.id } });
        continue;
      }
      const same =
        existing.date === data.date &&
        existing.timeLabel === data.timeLabel &&
        existing.section === data.section &&
        existing.title === data.title &&
        existing.notes === data.notes &&
        existing.linkUrl === data.linkUrl &&
        existing.linkLabel === data.linkLabel &&
        existing.sortOrder === data.sortOrder &&
        JSON.stringify(existing.customValues) === JSON.stringify(data.customValues);
      if (same) {
        unchanged++;
      } else {
        updated++;
        if (APPLY) await prisma.scheduleItem.update({ where: { id: existing.id }, data });
      }
    }

    // Sessions written on this site on the same days would show twice.
    const importedDates = [...new Set(importable.map((r) => r.date))];
    const overlaps = await prisma.scheduleItem.findMany({
      where: { sourceId: null, date: { in: importedDates } },
      orderBy: [{ date: 'asc' }],
      select: { id: true, date: true, title: true },
    });

    // Imported earlier but since deleted in Firebase.
    const sourceIds = new Set(rows.map((r) => r.id));
    const stale = (
      await prisma.scheduleItem.findMany({
        where: { sourceId: { not: null } },
        select: { id: true, sourceId: true, date: true, title: true },
      })
    ).filter((i) => !sourceIds.has(i.sourceId!));

    if (APPLY && REPLACE_OVERLAPS && overlaps.length) {
      await prisma.scheduleItem.deleteMany({ where: { id: { in: overlaps.map((o) => o.id) } } });
    }
    if (APPLY && PRUNE && stale.length) {
      await prisma.scheduleItem.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }

    console.log(`\nFirebase: ${rows.length} sessions, ${columns.length} custom columns`);
    console.log(`Sessions: ${created} new, ${updated} updated, ${unchanged} unchanged, ${skipped.length} skipped`);
    for (const s of skipped) console.log(`  skipped ${s}`);
    for (const t of titled) console.log(`  no title in Firebase — ${t}`);
    for (const b of badLinks) console.log(`  link dropped (not http/https): ${b}`);

    if (overlaps.length) {
      const verb = APPLY && REPLACE_OVERLAPS ? 'deleted' : 'kept (use --replace-overlaps to delete)';
      console.log(`\n${overlaps.length} site session(s) on imported dates — ${verb}:`);
      for (const o of overlaps) console.log(`  ${o.date}  ${o.title}`);
    }
    if (stale.length) {
      const verb = APPLY && PRUNE ? 'deleted' : 'kept (use --prune to delete)';
      console.log(`\n${stale.length} imported session(s) no longer in Firebase — ${verb}:`);
      for (const s of stale) console.log(`  ${s.date}  ${s.title}`);
    }
    console.log(APPLY ? '\nDone.' : '\nDry run complete — nothing was written.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
