import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

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

const SAMPLE_POSTS: Array<{ title: string; description: string; category: string; daysFromNow: number }> = [
  {
    title: 'عظمة أمر الإسلام بالعدل',
    category: 'مفاهيم شرعية',
    description:
      'العدل في الإسلام قيمة راسخة تكفّل بها الله في كتابه، قال تعالى: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا كُونُوا قَوَّامِينَ بِالْقِسْطِ﴾، وهو عدلٌ ينسحب على المسلم مع نفسه وأهله، ومع من يحب ويكره.',
    daysFromNow: 0,
  },
  {
    title: 'من أخلاقه عليه الصلاة والسلام',
    category: 'حديث عن الرسول',
    description:
      'كان ﷺ أميناً صادقاً قبل البعثة يُلقّب بالصادق الأمين، فبلّغوا الأمانة في كل تعاملاته، وقد أتاه رجل بخفرٍ فأعطاه فوق طلبه إكراماً لأمانته.',
    daysFromNow: 0,
  },
  {
    title: 'الرضوان — عهد الخندق',
    category: 'معلومة من السيرة',
    description:
      'بعد صلح الحديبية بايع المسلمون النبي ﷺ تحت الشجرة على ألاّ يفروا، فسمي ذلك الجيش أسير الرضوان، ونزل قول الله: ﴿لقد رضي الله عن المؤمنين إذ يبايعونك تحت الشجرة﴾.',
    daysFromNow: 0,
  },
  {
    title: 'من أدب فتح مكة',
    category: 'معلومة تاريخية',
    description:
      'دخل النبي ﷺ مكة فاتحاً يوم العاشر من رمضان، ووهب أهلها الأمن والعفو العام، ثم تطهير البيت من الأصنام، فما نال أحداً أذى ممن آمنوه شيئاً.',
    daysFromNow: 0,
  },
  {
    title: 'الإسلام ينبوع حضارة لا شقاق',
    category: 'الفكر الإسلامي',
    description:
      'نظرة الفكر الإسلامي إلى الحضارة تنظر إليها على أنها مبنية على العلم النافع والسياسة العادلة، وقد ارتبط اكتشاف أوروبا الحديثة بتراث الأندلس الإسلامي.',
    daysFromNow: 0,
  },
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

function isoDaysFromNow(n: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

async function main() {
  console.log('Seeding...');

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

  const weekRows = [...WEEK_1, ...WEEK_2].map((row, index) => {
    const date = currentWeekStart();
    date.setDate(date.getDate() + index);
    return {
      ...row,
      id: `${isoDate(date)}-${row.weekday}`,
      date: isoDate(date),
      weekdayKey: row.weekday,
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
  console.log(`- ${weekRows.length} activities in the weekly schedule`);

  // Accounts
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('Missing required environment variable: SEED_ADMIN_PASSWORD');
  const adminHash = await hashPassword(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@almagles.app' },
    update: {},
    create: {
      name: 'مدير الموقع',
      email: 'admin@almagles.app',
      passwordHash: adminHash,
      role: 'admin',
    },
  });

  // Keep demo credentials outside the repository. In local development they can
  // reuse SEED_ADMIN_PASSWORD unless SEED_DEMO_PASSWORD is provided.
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? adminPassword;
  const demoHash = await hashPassword(demoPassword);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@almagles.app' },
    update: {},
    create: {
      name: 'زائر تجريبي',
      email: 'demo@almagles.app',
      passwordHash: demoHash,
      role: 'visitor',
    },
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
  console.log(`- admin: admin@almagles.app / ${adminPassword}`);
  console.log(`- demo : demo@almagles.app / ${demoPassword}`);
  console.log(`- writer: writer@almagles.app / ${demoPassword}`);

  const todayISO = isoDaysFromNow(0);
  let sampleCount = 0;
  const samplePosts: Array<{ id: string; title: string }> = [];
  for (const post of SAMPLE_POSTS) {
    const catId = categories[post.category];
    if (!catId) continue;
    const exists = await prisma.post.findFirst({
      where: { title: post.title, categoryId: catId, postDate: todayISO },
    });
    const created = exists ?? (await prisma.post.create({
        data: {
          title: post.title,
          description: post.description,
          postDate: todayISO,
          categoryId: catId,
          authorId: post.category === 'الفكر الإسلامي' ? admin.id : demo.id,
        },
      }));
    if (!exists) sampleCount += 1;
    samplePosts.push({ id: created.id, title: created.title });
  }
  console.log(`- ${sampleCount} sample posts (scheduled for today)`);

  const firstPost = samplePosts[0];
  if (firstPost) {
    const existingComment = await prisma.comment.findFirst({ where: { postId: firstPost.id, authorId: demo.id } });
    if (!existingComment) {
      await prisma.comment.create({
        data: { postId: firstPost.id, authorId: demo.id, content: 'طرح جميل ومختصر، خصوصاً الربط بين العدل والمعاملة اليومية.' },
      });
    }
    const existingReply = await prisma.comment.findFirst({ where: { postId: firstPost.id, authorId: admin.id } });
    if (!existingReply) {
      await prisma.comment.create({
        data: { postId: firstPost.id, authorId: admin.id, content: 'جزاك الله خيراً على الإضافة الطيبة.', parentId: existingComment?.id ?? undefined },
      });
    }
  }

  for (const [index, post] of samplePosts.entries()) {
    const userId = index % 2 === 0 ? demo.id : admin.id;
    await prisma.reaction.upsert({
      where: { postId_userId: { postId: post.id, userId } },
      update: { type: index % 2 === 0 ? '❤️' : '👍' },
      create: { postId: post.id, userId, type: index % 2 === 0 ? '❤️' : '👍' },
    });
  }
  console.log('- demo comments and reactions');

  console.log('Done ✓');
}

void isoDaysFromNow;

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
