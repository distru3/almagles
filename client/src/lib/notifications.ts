import type { NotificationItem } from './types';
import { WEEKDAY_NAMES, hijriShort, weekdayKey } from './dates';

const SOMEONE = 'أحد الأعضاء';

/** «الأحد ١٨ جمادى الأولى» */
const dayName = (iso: string) => `${WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))]} ${hijriShort(iso)}`;

/**
 * The sentence shown for a notification, e.g. «أحمد ردّ على تعليقك في «…»».
 * Same wording as the phone popups (server/src/lib/notifications.ts, scheduleNotifications.ts).
 */
export function notificationText(n: NotificationItem): string {
  if (n.type === 'schedule_change') {
    const who = n.actor?.name ?? 'أحد المشرفين';
    const dates = n.scheduleDates;
    if (dates.length <= 1) return `${who} حدّث جدول ${dates[0] ? dayName(dates[0]) : 'المجالس'}`;
    const more = dates.length - 3;
    return `${who} حدّث الجدول: ${dates.slice(0, 3).map(dayName).join('، ')}${more === 1 ? ' ويوم آخر' : more > 1 ? ` و${more} أيام أخرى` : ''}`;
  }
  if (n.type === 'schedule_reminder') {
    return `حان وقت المجلس: «${n.scheduleItem?.title ?? ''}»`;
  }
  if (n.type === 'task_nudge') {
    return `${n.actor?.name ?? SOMEONE} يشدّ أزرك: إخوانك في المهام بانتظارك`;
  }
  if (n.type === 'adhkar_morning') {
    return 'حان وقت أذكار الصباح لحفظك وبركة يومك';
  }
  if (n.type === 'adhkar_evening') {
    return 'حان وقت أذكار المساء لتحصين نفسك وأهلك';
  }
  if (n.type === 'adhkar_sleep') {
    return 'حان وقت أذكار النوم والاضطجاع';
  }

  const who = n.actor?.name ?? SOMEONE;
  const title = `«${n.post?.title ?? ''}»`;
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

/** The second line under the sentence: what was written, or the session's details. */
export function notificationExcerpt(n: NotificationItem): string | null {
  if (n.type === 'schedule_reminder' && n.scheduleItem) {
    const details = [n.scheduleItem.section, n.scheduleItem.timeLabel].filter(Boolean).join(' · ');
    return [details, n.scheduleItem.reminderMessage].filter(Boolean).join(' — ') || null;
  }
  if (n.type === 'task_nudge') return '«المؤمن للمؤمن كالبنيان يشدّ بعضه بعضًا»';
  if (n.type === 'adhkar_morning') return 'أصبحنا وأصبح الملك لله — أذكار الصباح';
  if (n.type === 'adhkar_evening') return 'أمسينا وأمسى الملك لله — أذكار المساء';
  if (n.type === 'adhkar_sleep') return 'باسمك ربي وضعت جنبي وبك أرفعه — أذكار النوم';
  return n.excerpt;
}

/** Where clicking it goes: the comment itself when there is one; the schedule on the right week. */
export function notificationLink(n: NotificationItem): string {
  if (n.type === 'task_nudge') return '/tasks';
  if (n.type === 'adhkar_morning') return '/adhkar?type=morning';
  if (n.type === 'adhkar_evening') return '/adhkar?type=evening';
  if (n.type === 'adhkar_sleep') return '/adhkar?type=sleep';
  const scheduleDate = n.scheduleItem?.date ?? n.scheduleDates[0];
  if (!n.post) return scheduleDate ? `/?date=${scheduleDate}#schedule` : '/#schedule';
  return n.commentId ? `/post/${n.post.id}#comment-${n.commentId}` : `/post/${n.post.id}`;
}
