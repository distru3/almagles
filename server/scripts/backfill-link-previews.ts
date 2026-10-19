/**
 * Fill in link previews that are missing: posts written before previews
 * existed, and links the detector didn't recognise when the post was saved
 * (e.g. a bare youtu.be/… before bare domains were supported).
 *
 * Only touches posts with a link that has no preview, and only the
 * linkPreviews column; existing previews are kept. Without --apply nothing is
 * written.
 *
 *   npm run backfill:previews -w server                 # dry run
 *   npm run backfill:previews -w server -- --apply      # write
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { extractUrls, previewsFor, MAX_PREVIEWS } from '../src/lib/linkPreview.js';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const posts = await prisma.post.findMany({
    select: { id: true, title: true, description: true, linkPreviews: true },
    orderBy: { createdAt: 'asc' },
  });
  const known = (p: (typeof posts)[number]) =>
    new Set(Array.isArray(p.linkPreviews) ? (p.linkPreviews as { url?: string }[]).map((l) => l?.url) : []);
  const withLinks = posts.filter((p) => extractUrls(p.description).slice(0, MAX_PREVIEWS).some((u) => !known(p).has(u)));
  console.log(`${posts.length} posts; ${withLinks.length} have links without a preview.`);

  let cards = 0;
  for (const post of withLinks) {
    const previews = await previewsFor(post.description, post.linkPreviews);
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
