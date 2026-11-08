import type { NotificationItem } from './types';

const SOMEONE = 'أحد الأعضاء';

/** The sentence shown for a notification, e.g. «أحمد ردّ على تعليقك في «…»». */
export function notificationText(n: NotificationItem): string {
  const who = n.actor?.name ?? SOMEONE;
  const title = `«${n.post.title}»`;
  switch (n.type) {
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

/** Where clicking it goes: the comment itself when there is one. */
export function notificationLink(n: NotificationItem): string {
  return n.commentId ? `/post/${n.post.id}#comment-${n.commentId}` : `/post/${n.post.id}`;
}
