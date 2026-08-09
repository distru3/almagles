import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Promote a user to admin (or demote). Usage:
 *   npm run promote -- <email> [admin|visitor]
 */
async function main() {
  const email = process.argv[2];
  const roleArg = process.argv[3] ?? 'admin';
  if (!email) {
    console.error('الاستخدام: npm run promote -- <email> [admin|visitor]');
    process.exit(1);
  }
  if (roleArg !== 'admin' && roleArg !== 'visitor') {
    console.error('الدور يجب أن يكون admin أو visitor');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`لا يوجد مستخدم بهذا البريد: ${email}`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: roleArg },
  });

  console.log(`✓ ${email} أصبح ${roleArg === 'admin' ? 'مشرفاً' : 'زائراً'}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());