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
  | 'schedule_reminder'
  | 'task_nudge'
  | 'adhkar_morning'
  | 'adhkar_evening'
  | 'adhkar_sleep';

/** «أذكار الصباح» / «أذكار المساء»: minutes after Fajr / Asr where the member is, or a fixed clock time. */
export interface AdhkarPrayerWard {
  enabled: boolean;
  time: string;
  mode: 'prayer' | 'fixed';
  offset: number;
}

export interface AdhkarReminderSettings {
  enabled: boolean;
  timeZone: string;
  /** Where the reminders are timed for; null until the member's browser has sent it. */
  place: { lat: number; lng: number; method: string; label: string | null } | null;
  morning: AdhkarPrayerWard;
  evening: AdhkarPrayerWard;
  sleep: { enabled: boolean; time: string };
  hasPushSubscription?: boolean;
}

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

/** «مهامي»: how often a task's checkmark resets. */
export type TaskRepeat = 'daily' | 'weekly' | 'once';
export type TaskTime = 'anytime' | 'range' | 'qiyam';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string | null;
  repeat: TaskRepeat;
  points: number;
  /** First / last day it's shown ("2026-11-20"), or null. */
  startDate: string | null;
  endDate: string | null;
  /** Days a daily task applies on (0 = Sunday … 6 = Saturday); empty = every day. */
  weekdays: number[];
  timeWindow: TaskTime;
  /** "HH:MM", for timeWindow = range. */
  startTime: string | null;
  endTime: string | null;
  order: number;
  active: boolean;
  /** «طلب العلم»: ticked by itself when the member records any lesson of «رحلة العلم». */
  fromLearning: boolean;
}

/** A task as a member sees it: their checkmark for the current day / night / week, and how many members did it. */
export interface MyTask extends Task {
  /** The day this checkmark counts for — the evening before, for a night task after midnight. */
  day: string;
  done: boolean;
  doneCount: number;
}

export type ExcuseReason = 'sick' | 'travel' | 'other';

/** A daily task missed on a recent day that can still be made up («تدارك»). */
export interface MissedTask {
  id: string;
  title: string;
  description: string | null;
  timeWindow: TaskTime;
  day: string;
  /** What making it up earns now: full the next day, half after. */
  points: number;
}

export interface MyTasks {
  tasks: MyTask[];
  tomorrow: { id: string; title: string }[];
  missed: MissedTask[];
  /** The member's excused days among the last few. */
  excuses: { day: string; reason: ExcuseReason }[];
}

export interface TaskProgress {
  date: string;
  tasks: (Task & { period: string; doneCount: number })[];
  members: { id: string; name: string; avatarUrl: string | null; done: string[] }[];
}

export type BadgeId = 'steady' | 'firm' | 'qawwam' | 'hundred' | 'mudarik' | 'talib' | 'mulazim';

export interface BoardMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  total: number;
  ticks: number;
  week: number;
  today: number;
  streak: number;
  bestStreak: number;
  nights: number;
  madeUp: number;
  /** «طلب العلم»: lessons done, their points (in all, this week) and «سلسلة العلم». `week`/`total` include them. */
  lessons: number;
  ilmTotal: number;
  ilmWeek: number;
  ilmStreak: number;
  ilmBestStreak: number;
  /** The last day they worked or were excused. */
  lastDay: string | null;
  excusedToday: boolean;
  badges: BadgeId[];
}

/** One period of a task in «ثباتي»: kept, missed, still open today, or not a chance (excused, before starting…). */
export type SlotState = 'done' | 'miss' | 'off' | 'pending';

/** «سجلّي»: the member's own record, all of it. */
export interface TaskHistory {
  /** The member's devotional today (before Fajr: yesterday). */
  today: string;
  /** First day of the day-by-day log (26 weeks back, a Saturday). */
  from: string;
  /** Every day with work in it, oldest first; `lessons`/`ilmPoints` are the «رحلة العلم» share of it. */
  days: { day: string; points: number; count: number; lessons: number; ilmPoints: number }[];
  /** What was done on each day since `from`; a lesson's id is "lesson:<id>". */
  /** `progress` is set on a lesson only part done. */
  log: { day: string; items: { taskId: string; points: number; madeUp: boolean; learning: boolean; progress?: number }[] }[];
  /** «رحلة العلم» in the record. */
  learning: { enrolled: boolean; lessons: number; points: number; streak: number; bestStreak: number };
  titles: Record<string, string>;
  excused: { day: string; reason: 'sick' | 'travel' | 'other' }[];
  /** Current tasks of every kind; a one-off task has an empty strip. */
  tasks: (HistoryTaskSummary & {
    kept: number;
    possible: number;
    streak: number;
    /** The last 30 days (daily) or 8 weeks (weekly), oldest first. */
    strip: SlotState[];
  })[];
  /** Archived tasks, or ones whose last day has passed, that the member did — «من سجلّك السابق». */
  past: HistoryTaskSummary[];
}

export interface HistoryTaskSummary {
  id: string;
  title: string;
  description: string | null;
  repeat: TaskRepeat;
  timeWindow: TaskTime;
  /** Times done, ever. */
  total: number;
  lastDay: string | null;
}

/** «حال المجلس»: what the circle did together — no names. */
export interface TaskCommunity {
  today: string;
  from: string;
  members: number;
  totals: { ticks: number; points: number; nights: number; madeUp: number; lessons: number; ilmPoints: number; learners: number };
  /** Most faithfully kept first. */
  tasks: { id: string; title: string; timeWindow: TaskTime; repeat: TaskRepeat; rate: number; kept: number; possible: number }[];
  /** `count` is everything done that day, `ilm` the lessons among it. */
  series: { day: string; count: number; ilm: number }[];
  /** «همّة الأسبوع»: last month's least-kept task, revived together this week. */
  focus: { id: string; title: string; timeWindow: TaskTime; before: number; week: { kept: number; possible: number } } | null;
}

export interface TaskBoard {
  date: string;
  weekStart: string;
  weekEnd: string;
  members: BoardMember[];
  first: { id: string; name: string; avatarUrl: string | null; at: string } | null;
  /** «السبّاق إلى العلم»: the first to finish one of today's lessons. */
  firstIlm: { id: string; name: string; avatarUrl: string | null; at: string } | null;
  /** `learning`: a lesson of «رحلة العلم» rather than a task. */
  recent: { userId: string; name: string; avatarUrl: string | null; title: string; points: number; madeUp: boolean; learning?: boolean; at: string }[];
}

/** «رحلة العلم»: what a day's lesson asks of the member. */
export type LearningKind = 'reading' | 'video' | 'audio' | 'article' | 'practice';

/** A lesson on the shared calendar, as the managers write it. */
export interface LearningItem {
  id: string;
  date: string;
  kind: LearningKind;
  title: string;
  /** The book, the shaykh or the series. */
  source: string | null;
  /** How much: «من ص ١٢ إلى ص ٢٠». */
  portion: string | null;
  description: string | null;
  linkUrl: string | null;
  /** A PDF the manager attached, read inside the site («اقرأ هنا»). */
  fileUrl: string | null;
  filePublicId: string | null;
  fileName: string | null;
  fileBytes: number | null;
  filePages: number | null;
  /** The pages of the file the lesson starts and ends on (the end lets part of it be measured). */
  startPage: number | null;
  endPage: number | null;
  minutes: number | null;
  points: number;
  order: number;
  /** How many members finished it. */
  doneCount: number;
}

/** A lesson as one member sees it. */
export interface MyLearningItem extends LearningItem {
  /** Finished («أتممت»). */
  done: boolean;
  /** How much is recorded, 0–100; between them it's «أنجزت بعضه». */
  progress: number;
  /** The page of the PDF where the member stopped, from any device. */
  page: number | null;
  madeUp: boolean;
  /** Points earned for it. */
  earned: number;
  /** «فائدتي» — theirs alone. */
  note: string | null;
  /** What finishing it now would earn; null when it can't be ticked today. */
  worth: number | null;
}

/** null: not decided yet. active false: declined or left. */
export type LearningEnrollment = { active: boolean; startDay: string | null } | null;

export interface LearningJourney {
  today: string;
  restDay: boolean;
  enrollment: LearningEnrollment;
  /** Members on the journey now. */
  members: number;
  items: MyLearningItem[];
  stats: {
    done: number;
    total: number;
    /** Lessons whose day has come since the member joined, and how many of them they did. */
    due: number;
    keptDue: number;
    points: number;
    madeUp: number;
    notes: number;
    streak: number;
    bestStreak: number;
    lastDay: string | null;
  };
}

/** «رفقاء الرحلة». */
export interface LearningCompanions {
  date: string;
  total: number;
  todayCount: number;
  members: {
    id: string;
    name: string;
    avatarUrl: string | null;
    startDay: string | null;
    done: number;
    due: number;
    keptDue: number;
    points: number;
    /** Learning points this week. */
    week: number;
    todayDone: number;
    streak: number;
    bestStreak: number;
  }[];
}
