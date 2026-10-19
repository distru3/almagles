/**
 * Fetch link previews for posts written before previews existed. New and
 * edited posts get theirs when saved; this catches up the older ones.
 *
 * Only touches posts whose text contains links and that have no previews yet,
 * and only the linkPreviews column. Without --apply nothing is written.
 *
 *   npm run backfill:previews -w server                 # dry run
 *   npm run backfill:previews -w server -- --apply      # write
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { extractUrls, previewsFor } from '../src/lib/linkPreview.js';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const posts = await prisma.post.findMany({
    where: { linkPreviews: { equals: Prisma.DbNull } },
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: 'asc' },
  });
  const withLinks = posts.filter((p) => extractUrls(p.description).length > 0);
  console.log(`${posts.length} posts without previews; ${withLinks.length} contain links.`);

  let cards = 0;
  for (const post of withLinks) {
    const previews = await previewsFor(post.description, null);
    cards += previews.length;
    const found = previews.map((p) => `${p.kind === 'youtube' ? '▶' : '•'} ${p.title ?? p.url}`).join(' | ') || '(no preview available)';
    console.log(`- ${post.title.slice(0, 50)}: ${found}`);
    if (APPLY) {
      await prisma.post.update({ where: { id: post.id }, data: { linkPreviews: previews as unknown as Prisma.InputJsonValue } });
    }
  }
  console.log(APPLY ? `Saved ${cards} previews on ${withLinks.length} posts.` : `Dry run: would save ${cards} previews. Re-run with --apply to write.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
