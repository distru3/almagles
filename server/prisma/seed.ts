/**
 * Seeds the database.
 *
 *   npm run db:seed          categories, plus a first admin if the site has none
 *                            (safe on the live database; never touches existing data)
 *   npm run db:seed:demo     also demo accounts and two demo schedule weeks
 *                            — LOCAL DATABASES ONLY (no sample posts)
 *
 * Demo seeding refuses any database that isn't on this machine, because a
 * local .env pointing at the live database once filled the live site with demo
 * content. Override only for a disposable remote database:
 *   ALLOW_REMOTE_DEMO_SEED=1 npm run db:seed:demo
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const DEMO = process.argv.includes('--demo');

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
}

function isLocalDatabase(): boolean {
  const host = databaseHost();
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) || host.endsWith('.localhost');
}

// Refuse before the first query, so a refused run cannot touch the database.
if (DEMO && !isLocalDatabase() && process.env.ALLOW_REMOTE_DEMO_SEED !== '1') {
  console.error(
    `Refusing to seed demo content into a non-local database (${databaseHost() || 'unknown host'}).\n` +
      'Demo accounts and posts must never reach the live site. Point DATABASE_URL at a local database,\n' +
      'or set ALLOW_REMOTE_DEMO_SEED=1 if this remote database is disposable.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'مفاهيم شرعية', order: 0 },
  { name: 'حديث عن الرسول', order: 1 },
  { name: 'معلومة من السيرة', order: 2 },
  { name: 'معلومة تاريخية', order: 3 },
  { name: 'الفكر الإسلامي', order: 4 },
];

const WEEKDAYS: Record<string, string> = {
  sat: 'السبت',
  sun: 'الأحد',
  mon: 'الاثنين',
  tue: 'الثلاثاء',
  wed: 'الأربعاء',
  thu: 'الخميس',
  fri: 'الجمعة',
};

// Week 1: 18 -> 24 July 2026 (Saturday -> Friday)
const WEEK_1 = [
  { date: '2026-07-18', weekday: 'sat', section: 'قرآن — تدبر', title: 'تدبر سورة الأنعام', notes: 'الآيات ١٩ - ٢٠، من الدقيقة ١ حتى ١٥ من ٣١، فاضل سليماني' },
  { date: '2026-07-19', weekday: 'sun', section: 'قرآن — تدبر', title: 'تدبر سورة الأنعام', notes: 'الآيات ٢١ - ٢٢، من الدقيقة ١٦ حتى ٣١ (النهاية)، فاضل سليماني' },
  { date: '2026-07-20', weekday: 'mon', section: 'قرآن — تدبر', title: 'تدبر سورة الأنعام', notes: 'الآيات ٢٣ - ٢٤، من الدقيقة ١ إلى ١٥ (٣٢)، فاضل سليماني' },
  { date: '2026-07-21', weekday: 'tue', section: 'تزكية — الثقافة والسلوك', title: 'المشوق إلى القرآن', notes: 'ص ١٠٠ إلى ١٢٥، مراجعة ما تم حفظه، عمرو الشرقاوي' },
  { date: '2026-07-22', weekday: 'wed', section: 'تزكية — الثقافة والسلوك', title: 'المشوق إلى القرآن', notes: 'الآيات ٢٥ - ٢٦، ص ١٢٦ إلى ١٥٠، عمرو الشرقاوي' },
  { date: '2026-07-23', weekday: 'thu', section: 'استدراك ومراجعة', title: 'مراجعة تدبر الأنعام', notes: 'الآيات ٢٧ - ٢٨، آيات ١٢٢ إلى ١٢٦ (مراجعة)' },
  { date: '2026-07-24', weekday: 'fri', section: 'استدراك وتسميع', title: 'تسميع سورة الأنعام', notes: 'الآيات من ١ إلى ٢٨ — تسميع ما تم حفظه' },
];

// Week 2: 25 -> 31 July 2026
const WEEK_2 = [
  { date: '2026-07-25', weekday: 'sat', section: 'قرآن — تدبر', title: 'تدبر سورة الأنعام', notes: 'الآيات ٢٩ - ٣٠، من الدقيقة ١ إلى ١٦ (٣٢ النهاية)، فاضل سليماني' },
  { date: '2026-07-26', weekday: 'sun', section: 'تزكية — الثقافة والسلوك', title: 'المشوق إلى القرآن', notes: 'الآيات ٣١ - ٣٢، ص ١٥١ إلى ١٧٥، مراجعة ما تم حفظه' },
  { date: '2026-07-27', weekday: 'mon', section: 'قرآن — تدبر', title: 'تدبر سورة الأنعام', notes: 'الآيات ٣٣ - ٣٤، من الدقيقة ١ إلى ١٥ (٣٣)، فاضل سليماني' },
  { date: '2026-07-28', weekday: 'tue', section: 'تزكية — الثقافة والسلوك', title: 'المشوق إلى القرآن', notes: 'مراجعة ما تم حفظه، ص ١٧٦ إلى ٢٠٠' },
  { date: '2026-07-29', weekday: 'wed', section: 'قرآن — تدبر', title: 'تدبر سورة الأنعام', notes: 'الآيات ٣٥ - ٣٦، من الدقيقة ١ إلى ١٥ (٣٣ النهاية)، فاضل سليماني' },
  { date: '2026-07-30', weekday: 'thu', section: 'استدراك ومراجعة', title: 'مراجعة تدبر الأنعام', notes: 'الآيات ٣٧ - ٣٨، آية ١٢٧ إلى ١٣٠ (مراجعة)' },
  { date: '2026-07-31', weekday: 'fri', section: 'استدراك وتسميع', title: 'تسميع سورة الأنعام', notes: 'الآيات من ١ إلى ٣٨ — تسميع ما تم حفظه' },
];

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const today = new Date();

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentWeekStart(): Date {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  // The product week starts on Saturday.
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  return start;
}


async function seedCategories(): Promise<Record<string, string>> {
  const categories: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { slug: slugify(c.name) },
      update: { order: c.order },
      create: { name: c.name, slug: slugify(c.name), order: c.order },
    });
    categories[c.name] = created.id;
  }
  console.log(`- ${CATEGORIES.length} categories`);
  return categories;
}

/** Creates the first admin only when the site has none — never resets an existing account. */
async function ensureAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) {
    console.log('- admin: an admin account already exists (left unchanged)');
    return existing;
  }
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@almagles.app').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('No admin exists yet: set SEED_ADMIN_PASSWORD (and optionally SEED_ADMIN_EMAIL)');
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin' },
    create: { name: 'مدير الموقع', email, passwordHash: await hashPassword(password), role: 'admin' },
  });
  console.log(`- admin: created ${email} (password from SEED_ADMIN_PASSWORD)`);
  return admin;
}

async function seedDemo() {
  const weekRows = [...WEEK_1, ...WEEK_2].map((row, index) => {
    const date = currentWeekStart();
    date.setDate(date.getDate() + index);
    return {
      ...row,
      id: `${isoDate(date)}-${row.weekday}`,
      date: isoDate(date),
      timeLabel: index % 2 === 0 ? 'فجر' : 'بعد المغرب',
    };
  });
  for (const row of weekRows) {
    await prisma.scheduleItem.upsert({
      where: { id: row.id },
      update: { title: row.title, section: row.section ?? null, notes: row.notes ?? null, timeLabel: row.timeLabel },
      create: {
        id: row.id,
        date: row.date,
        weekdayKey: row.weekday,
        timeLabel: row.timeLabel,
        section: row.section ?? null,
        title: row.title,
        notes: row.notes ?? null,
      },
    });
  }
  console.log(`- ${weekRows.length} demo schedule sessions`);

  // Demo accounts get their own password — never the admin's.
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword) throw new Error('Set SEED_DEMO_PASSWORD for the demo accounts');
  const demoHash = await hashPassword(demoPassword);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@almagles.app' },
    update: {},
    create: { name: 'زائر تجريبي', email: 'demo@almagles.app', passwordHash: demoHash, role: 'visitor' },
  });
  const writer = await prisma.user.upsert({
    where: { email: 'writer@almagles.app' },
    update: { role: 'writer', canManageSchedule: true },
    create: {
      name: 'كاتب تجريبي',
      email: 'writer@almagles.app',
      passwordHash: demoHash,
      role: 'writer',
      canManageSchedule: true,
    },
  });
  await prisma.user.update({
    where: { id: writer.id },
    data: { managedCategories: { connect: CATEGORIES.slice(0, 2).map((c) => ({ slug: slugify(c.name) })) } },
  });
  console.log('- demo accounts: demo@almagles.app, writer@almagles.app (password from SEED_DEMO_PASSWORD)');
}

async function main() {
  console.log(DEMO ? 'Seeding (with demo content)...' : 'Seeding...');
  await seedCategories();
  await ensureAdmin();
  if (DEMO) await seedDemo();
  console.log('Done ✓');
}

main()
  .catch((err) => {
    console.error(err);
    // Exit code, not process.exit(): let the finally below close the connection.
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
