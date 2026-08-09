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
}

export interface Post {
  id: string;
  title: string;
  description: string;
  postDate: string;
  imagePublicId: string | null;
  imageUrl: string | null;
  category: Category;
  author: Author;
  createdAt: string;
  reactionCounts: Record<string, number>;
  myReaction: string | null;
  commentsCount: number;
  totalReactions?: number;
}

export interface CommentItem {
  id: string;
  content: string;
  postId: string;
  postTitle?: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  repliesCount: number;
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
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'visitor';
}

export interface PostsResponse {
  items: Post[];
  total: number;
  page: number;
  limit: number;
}