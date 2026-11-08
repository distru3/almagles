export interface Category {
  id: string;
  name: string;
  slug: string;
  order: number;
  postCount: number;
}

export interface Author {
  id: string;
  name: string;
  role?: 'visitor' | 'writer' | 'admin';
  avatarUrl?: string | null;
}

/** What anyone can see about a member (never their email). */
export interface PublicProfile {
  id: string;
  name: string;
  role: 'visitor' | 'writer' | 'admin';
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  postsCount: number;
  commentsCount: number;
}

export interface LinkPreview {
  url: string;
  kind: 'youtube' | 'page';
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  youtubeId?: string;
}

/** One photo of a post. width/height let the page reserve its space before it loads. */
export interface PostImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface Post {
  id: string;
  title: string;
  description: string;
  postDate: string;
  /** In display order; the first is the cover. */
  images: PostImage[];
  videoUrl?: string | null;
  videoPosterUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoDuration?: number | null;
  /** Previews of the links in the description, fetched when the post was saved. */
  linkPreviews?: LinkPreview[] | null;
  category: Category;
  author: Author;
  createdAt: string;
  reactionCounts: Record<string, number>;
  myReaction: string | null;
  commentsCount: number;
  /** Newest top-level comment, for the feed card preview (list endpoint only). */
  topComment?: { content: string; authorId?: string; authorName: string; authorAvatarUrl?: string | null } | null;
  totalReactions?: number;
  prevPost?: { id: string; title: string; postDate: string } | null;
  nextPost?: { id: string; title: string; postDate: string } | null;
}

export interface CommentItem {
  id: string;
  content: string;
  postId: string;
  postTitle?: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorRole?: string;
  authorAvatarUrl?: string | null;
  createdAt: string;
  repliesCount: number;
  /** Missing on comments that come from places other than a post's comment list. */
  reactionCounts?: Record<string, number>;
  myReaction?: string | null;
}

export interface ScheduleItem {
  id: string;
  date: string;
  weekdayKey: string;
  timeLabel: string;
  section: string | null;
  title: string;
  notes: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  /** Values for custom columns, keyed by ScheduleColumn.id. */
  customValues: Record<string, string>;
  sortOrder: number;
  /** "HH:MM" (24h): when «حان وقت المجلس» goes out. Null = no reminder. */
  startTime: string | null;
  timeZone: string | null;
  /** Sent under the reminder: a verse, a hadith or the manager's own words. */
  reminderMessage: string | null;
}

export interface ScheduleColumn {
  id: string;
  label: string;
  order: number;
}

/** «ملاحظات المجلس» for one day. */
export interface CouncilNote {
  date: string;
  content: string;
  updatedAt: string;
  updatedByName: string | null;
}

export interface ScheduleResponse {
  items: ScheduleItem[];
  columns: ScheduleColumn[];
  notes: CouncilNote[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'visitor' | 'writer' | 'admin';
  canManageSchedule: boolean;
  managedCategoryIds: string[];
  avatarUrl: string | null;
  bio: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'visitor' | 'writer' | 'admin';
  canManageSchedule: boolean;
  createdAt: string;
  managedCategories: { id: string; name: string }[];
}

export interface PostsResponse {
  items: Post[];
  total: number;
  page: number;
  limit: number;
}
export type NotificationType =
  | 'comment'
  | 'reply'
  | 'reaction'
  | 'comment_reaction'
  | 'new_post'
  | 'schedule_change'
  | 'schedule_reminder';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  /** Null for schedule notifications. */
  post: { id: string; title: string } | null;
  commentId: string | null;
  excerpt: string | null;
  /** schedule_reminder: the session whose time has come. */
  scheduleItem: { id: string; date: string; title: string; section: string | null; timeLabel: string; reminderMessage: string | null } | null;
  /** schedule_change: the days whose sessions changed. */
  scheduleDates: string[];
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}
