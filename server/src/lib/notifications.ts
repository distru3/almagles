import type { NotificationType } from '@prisma/client';
import { prisma } from '../db.js';
import { pushToUsers } from './push.js';

/**
 * Notifications are a side effect: a failure here must never fail the comment,
 * reaction or post that triggered it, so every helper logs and swallows errors.
 */
async function safely(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[notifications] ${label}`, err);
  }
}

const SITE_NAME = 'رجال الأمة';
const EXCERPT_LENGTH = 120;

/** Same wording as the site's list (client/src/lib/notifications.ts). */
function sentence(type: NotificationType, actorName: string | null, postTitle: string): string {
  const who = actorName ?? 'أحد الأعضاء';
  const title = `«${postTitle}»`;
  switch (type) {
    case 'comment':
      return `${who} علّق على منشورك ${title}`;
    case 'reply':
      return `${who} ردّ على تعليقك في ${title}`;
    case 'reaction':
      return `${who} تفاعل مع منشورك ${title}`;
    case 'comment_reaction':
      return `${who} تفاعل مع تعليقك في ${title}`;
    case 'new_post':
      return `منشور جديد: ${title}`;
  }
}

/**
 * Stores one notification per recipient and pushes it to their phones. Every
 * recipient in one call shares the same actor, post and comment; only the
 * type can differ (a reply's author gets "reply", the post's author "comment").
 */
async function notify(
  recipients: Map<string, NotificationType>,
  ref: { actorId: string; postId: string; commentId?: string },
): Promise<void> {
  recipients.delete(ref.actorId);
  if (!recipients.size) return;

  const rows = await prisma.notification.createManyAndReturn({
    data: [...recipients].map(([userId, type]) => ({ type, userId, ...ref })),
    select: { id: true, userId: true, type: true },
  });

  const [actor, post, comment] = await Promise.all([
    prisma.user.findUnique({ where: { id: ref.actorId }, select: { name: true } }),
    prisma.post.findUnique({ where: { id: ref.postId }, select: { title: true } }),
    ref.commentId ? prisma.comment.findUnique({ where: { id: ref.commentId }, select: { content: true } }) : null,
  ]);
  if (!post) return;
  const hash = ref.commentId ? `#comment-${ref.commentId}` : '';

  pushToUsers(
    rows.map((n) => {
      const text = sentence(n.type, actor?.name ?? null, post.title);
      // A new comment or reply shows what was written; a reaction doesn't repeat it.
      const excerpt = comment && n.type !== 'comment_reaction' ? comment.content.slice(0, EXCERPT_LENGTH) : null;
      return {
        userId: n.userId,
        payload: {
          title: SITE_NAME,
          body: excerpt ? `${text}\n${excerpt}` : text,
          url: `/post/${ref.postId}?n=${n.id}${hash}`,
          tag: `${n.type}:${ref.commentId ?? ref.postId}`,
        },
      };
    }),
  );
}

/**
 * A new comment notifies whoever it replies to ("reply") and the post's author
 * ("comment"). `repliedToId` is the comment the user pressed «رد» on: replies
 * are stored one level deep, so that can differ from the stored parent.
 */
export function notifyComment(comment: {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  repliedToId?: string | null;
}) {
  return safely('comment', async () => {
    const recipients = new Map<string, NotificationType>();

    const parentIds = [...new Set([comment.repliedToId, comment.parentId].filter((x): x is string => !!x))];
    if (parentIds.length) {
      const parents = await prisma.comment.findMany({ where: { id: { in: parentIds } }, select: { authorId: true } });
      for (const p of parents) recipients.set(p.authorId, 'reply');
    }

    const post = await prisma.post.findUnique({ where: { id: comment.postId }, select: { authorId: true } });
    if (post && !recipients.has(post.authorId)) recipients.set(post.authorId, 'comment');

    await notify(recipients, { actorId: comment.authorId, postId: comment.postId, commentId: comment.id });
  });
}

/** Keeps at most one reaction notification per person per post, however often they change it. */
export function notifyReaction(postId: string, actorId: string, removed: boolean) {
  return safely('reaction', async () => {
    await prisma.notification.deleteMany({ where: { type: 'reaction', postId, actorId } });
    if (removed) return;
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) return;
    await notify(new Map([[post.authorId, 'reaction']]), { actorId, postId });
  });
}

/** Like notifyReaction, for a comment or reply: at most one per person per comment. */
export function notifyCommentReaction(comment: { id: string; postId: string; authorId: string }, actorId: string, removed: boolean) {
  return safely('comment_reaction', async () => {
    await prisma.notification.deleteMany({ where: { type: 'comment_reaction', commentId: comment.id, actorId } });
    if (removed) return;
    await notify(new Map([[comment.authorId, 'comment_reaction']]), {
      actorId,
      postId: comment.postId,
      commentId: comment.id,
    });
  });
}

/** Tells every other account that a post was published. */
export function notifyNewPost(post: { id: string; authorId: string }) {
  return safely('new_post', async () => {
    const users = await prisma.user.findMany({ where: { id: { not: post.authorId } }, select: { id: true } });
    await notify(new Map(users.map((u) => [u.id, 'new_post'])), { actorId: post.authorId, postId: post.id });
  });
}
