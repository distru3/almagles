import { Heart, MessageSquare, Reply, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NotificationItem, NotificationType } from '../lib/types';
import { notificationText } from '../lib/notifications';
import { timeAgo } from '../lib/dates';
import Avatar from './Avatar';

const ICONS: Record<NotificationType, LucideIcon> = {
  comment: MessageSquare,
  reply: Reply,
  reaction: Heart,
  comment_reaction: Heart,
  new_post: FileText,
};

export default function NotificationList({
  items,
  onOpen,
  compact = false,
}: {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => {
        const Icon = ICONS[n.type];
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onOpen(n)}
              className={`flex w-full items-start gap-3 text-start transition hover:bg-surface-2 ${compact ? 'px-4 py-3' : 'px-4 py-4 sm:px-5'} ${
                n.read ? '' : 'bg-accent-soft/40'
              }`}
            >
              <span className="relative shrink-0">
                <Avatar name={n.actor?.name ?? 'ع'} src={n.actor?.avatarUrl} size="md" />
                <span className="absolute -bottom-1 -start-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-accent-fill text-on-accent">
                  <Icon className="h-3 w-3" aria-hidden="true" />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] leading-7 ${n.read ? 'text-fg-2' : 'font-semibold text-fg'}`}>
                  {notificationText(n)}
                </span>
                {n.excerpt && (
                  <span className={`mt-0.5 block text-sm leading-6 text-muted ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>
                    {n.excerpt}
                  </span>
                )}
                <span className="mt-1 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
              </span>
              {!n.read && <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="غير مقروء" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
