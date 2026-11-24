import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { pushToUsers } from '../lib/push.js';
import { mentionNames, mentionsSchema, resolveMentions } from '../lib/mentions.js';

/**
 * «فوائد الإخوة» and «فوائدي»: the fawa'id of «رحلة العلم». A note is first
 * written from the member's own lesson (routes/learning.ts); from then on it
 * stands by itself, and here its writer finds all of theirs and edits,
 * shares or deletes them, while the brothers read the shared ones, like them
 * («أعجبني») and reply. A private note is never served to anyone but its
 * writer.
 */
const router = Router();
router.use(requireAuth);

const EXCERPT_LENGTH = 120;

const AUTHOR = { select: { id: true, name: true, avatarUrl: true } } as const;
/** A note as everyone sees it, with whether this reader liked it. */
const noteSelect = (viewerId: string) =>
  ({
    id: true,
    text: true,
    shared: true,
    createdAt: true,
    updatedAt: true,
    user: AUTHOR,
    itemId: true,
    lessonTitle: true,
    lessonPortion: true,
    lessonKind: true,
    lessonDate: true,
    likes: { where: { userId: viewerId }, select: { userId: true } },
    _count: { select: { replies: true, likes: true } },
  }) as const;
const REPLY_SELECT = { id: true, text: true, mentionIds: true, createdAt: true, updatedAt: true, author: AUTHOR } as const;
type ReplyRow = { mentionIds: string[] } & Record<string, unknown>;
/** Replies as the client shows them: «@الاسم» with who it is. */
async function repliesOut<T extends ReplyRow>(rows: T[]) {
  const namesOf = await mentionNames(rows.map((r) => r.mentionIds));
  return rows.map(({ mentionIds, ...r }) => ({ ...r, mentions: namesOf(mentionIds) }));
}

type NoteRow = {
  id: string;
  text: string;
  shared: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; avatarUrl: string | null };
  itemId: string | null;
  lessonTitle: string;
  lessonPortion: string | null;
  lessonKind: string;
  lessonDate: string;
  likes: { userId: string }[];
  _count: { replies: number; likes: number };
};
const noteOut = ({ user, itemId, lessonTitle, lessonPortion, lessonKind, lessonDate, likes, _count, ...n }: NoteRow) => ({
  ...n,
  author: user,
  /** id is null once a manager deleted the lesson; the rest is how it was. */
  lesson: { id: itemId, title: lessonTitle, portion: lessonPortion, date: lessonDate, kind: lessonKind },
  replyCount: _count.replies,
  likeCount: _count.likes,
  liked: likes.length > 0,
});

/** Admins and the journey's supervisors keep the discussion clean. */
const isModerator = (user: { role: string; canManageSchedule: boolean }) => user.role === 'admin' || user.canManageSchedule;

/** The note, if it's shared — or the reader's own. */
async function visibleNote(noteId: string, userId: string) {
  const note = await prisma.learningNote.findUnique({ where: { id: noteId }, select: noteSelect(userId) });
  if (!note || (!note.shared && note.user.id !== userId)) throw new HttpError(404, 'الفائدة غير موجودة أو لم تعد مشاركة');
  return note;
}

const listSchema = z.object({
  /** One lesson's shared notes («فوائد إخوانك» under it); without it, the latest of all. */
  itemId: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** The latest shared fawa'id, newest first. */
router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { itemId, cursor, limit } = req.query as unknown as z.infer<typeof listSchema>;
    const rows = await prisma.learningNote.findMany({
      where: { shared: true, ...(itemId ? { itemId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: noteSelect(req.user!.id),
    });
    const page = rows.slice(0, limit);
    return res.json({ notes: page.map(noteOut), nextCursor: rows.length > limit ? page[page.length - 1].id : null });
  } catch (err) {
    next(err);
  }
});

const mineSchema = z.object({
  /** Words to look for in the note or its lesson's name. */
  q: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * «فوائدي»: every فائدة the member wrote, newest first, from every lesson —
 * ticked or not, still on the calendar or not.
 */
router.get('/mine', validate(mineSchema, 'query'), async (req, res, next) => {
  try {
    const { q, cursor, limit } = req.query as unknown as z.infer<typeof mineSchema>;
    const userId = req.user!.id;
    const insensitive = 'insensitive' as const;
    const where = {
      userId,
      ...(q ? { OR: [{ text: { contains: q, mode: insensitive } }, { lessonTitle: { contains: q, mode: insensitive } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.learningNote.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: noteSelect(userId),
      }),
      prisma.learningNote.count({ where }),
    ]);
    const page = rows.slice(0, limit);
    return res.json({ notes: page.map(noteOut), total, nextCursor: rows.length > limit ? page[page.length - 1].id : null });
  } catch (err) {
    next(err);
  }
});

/** Lessons one «أضف فائدة» from «فوائدي» may offer — plenty for a picker, a bound for a script. */
export const MAX_PICKER_LESSONS = 300;

/**
 * «أضف فائدة» from «فوائدي»: the lessons the member may write on — those they
 * finished or began, most recent first — and how many fawa'id each already
 * holds, so a full one can be shown as such. Writing goes through
 * POST /learning/items/:id/notes, which checks the same.
 */
router.get('/lessons', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const rows = await prisma.learningCompletion.findMany({
      where: { userId },
      orderBy: [{ day: 'desc' }, { updatedAt: 'desc' }],
      take: MAX_PICKER_LESSONS,
      select: { progress: true, item: { select: { id: true, title: true, portion: true, kind: true, date: true } } },
    });
    const counts = rows.length
      ? await prisma.learningNote.groupBy({ by: ['itemId'], where: { userId, itemId: { in: rows.map((r) => r.item.id) } }, _count: { _all: true } })
      : [];
    const countOf = new Map(counts.map((c) => [c.itemId, c._count._all]));
    return res.json({
      lessons: rows.map((r) => ({ ...r.item, progress: r.progress, noteCount: countOf.get(r.item.id) ?? 0 })),
    });
  } catch (err) {
    next(err);
  }
});

/** One فائدة with its discussion, oldest reply first. */
router.get('/:noteId', async (req, res, next) => {
  try {
    const note = await visibleNote(req.params.noteId, req.user!.id);
    const replies = await prisma.learningNoteReply.findMany({ where: { noteId: note.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: REPLY_SELECT });
    return res.json({ note: noteOut(note), replies: await repliesOut(replies) });
  } catch (err) {
    next(err);
  }
});

const noteText = z.string().trim().min(1, 'اكتب الفائدة أولاً').max(1000, 'الفائدة طويلة — اختصرها في سطور');
const editSchema = z
  .object({ text: noteText.optional(), shared: z.boolean().optional() })
  .refine((v) => v.text !== undefined || v.shared !== undefined, { message: 'لا تغيير' });

/**
 * Edit one's own فائدة from wherever it shows — «فوائدي», «فوائد الإخوة» or
 * under its lesson — or share it / stop sharing it. Unshared, its discussion
 * and likes are kept but hidden.
 */
router.put('/:noteId', validate(editSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof editSchema>;
    const userId = req.user!.id;
    const { count } = await prisma.learningNote.updateMany({ where: { id: req.params.noteId, userId }, data });
    if (count === 0) throw new HttpError(404, 'الفائدة غير موجودة');
    const note = await prisma.learningNote.findUniqueOrThrow({ where: { id: req.params.noteId }, select: noteSelect(userId) });
    return res.json({ note: noteOut(note) });
  } catch (err) {
    next(err);
  }
});

/** Only its writer deletes a فائدة, and its discussion goes with it. */
router.delete('/:noteId', async (req, res, next) => {
  try {
    const { count } = await prisma.learningNote.deleteMany({ where: { id: req.params.noteId, userId: req.user!.id } });
    if (count === 0) throw new HttpError(404, 'الفائدة غير موجودة');
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const likeSchema = z.object({ liked: z.boolean() });

/**
 * «أعجبني» on a shared فائدة, or taking it back. Quiet: nobody is notified,
 * the count is encouragement enough. Saying the same twice changes nothing.
 */
router.put('/:noteId/like', validate(likeSchema), async (req, res, next) => {
  try {
    const { liked } = req.body as z.infer<typeof likeSchema>;
    const userId = req.user!.id;
    const note = await visibleNote(req.params.noteId, userId);
    if (!note.shared) throw new HttpError(400, 'شارك الفائدة أولاً');
    const key = { noteId: note.id, userId };
    if (liked) {
      await prisma.learningNoteLike.upsert({ where: { noteId_userId: key }, create: key, update: {} });
    } else {
      await prisma.learningNoteLike.deleteMany({ where: key });
    }
    const likeCount = await prisma.learningNoteLike.count({ where: { noteId: note.id } });
    return res.json({ liked, likeCount });
  } catch (err) {
    next(err);
  }
});

const replySchema = z.object({
  text: z.string().trim().min(1, 'اكتب ردّك أولاً').max(1000, 'الردّ طويل — اختصره'),
  /** «@الاسم»: the members picked while writing. */
  mentions: mentionsSchema,
});

/** Tells the brothers a reply concerns: in-app, and on the phone. */
async function notifyReply(
  note: { id: string; lessonTitle: string; user: { id: string } },
  actor: { id: string; name: string },
  text: string,
  recipients: Map<string, 'learning_note_reply' | 'mention'>,
) {
  recipients.delete(actor.id);
  if (!recipients.size) return;
  const excerpt = text.slice(0, EXCERPT_LENGTH);
  const rows = await prisma.notification.createManyAndReturn({
    data: [...recipients].map(([userId, type]) => ({ type, userId, actorId: actor.id, learningNoteId: note.id, message: excerpt })),
    select: { id: true, userId: true, type: true },
  });
  const lesson = `«${note.lessonTitle}»`;
  const sentence = (n: { userId: string; type: string }) =>
    n.type === 'mention'
      ? `${actor.name} ذكرك في نقاش فائدة على ${lesson}`
      : n.userId === note.user.id
        ? `${actor.name} ردّ على فائدتك في ${lesson}`
        : `${actor.name} ردّ في نقاش فائدة على ${lesson}`;
  pushToUsers(
    rows.map((n) => ({
      userId: n.userId,
      payload: {
        title: 'رجال الأمة',
        body: `${sentence(n)}\n${excerpt}`,
        url: `/learn?tab=fawaid&note=${note.id}&n=${n.id}`,
        tag: `learning-note:${note.id}`,
      },
    })),
  );
}

/**
 * A reply under a shared فائدة. Its writer and everyone already in the
 * discussion hear of it, as with replies on a post, and whoever it tags with
 * «@الاسم» is told they were named — each once.
 */
router.post('/:noteId/replies', validate(replySchema), async (req, res, next) => {
  try {
    const { text, mentions } = req.body as z.infer<typeof replySchema>;
    const actor = req.user!;
    const note = await visibleNote(req.params.noteId, actor.id);
    if (!note.shared) throw new HttpError(400, 'شارك الفائدة أولاً ليتحاور فيها إخوانك');
    const tagged = await resolveMentions(text, mentions, actor.id);
    const row = await prisma.learningNoteReply.create({
      data: { noteId: note.id, authorId: actor.id, text, mentionIds: tagged.map((m) => m.id) },
      select: REPLY_SELECT,
    });
    const [reply] = await repliesOut([row]);

    const earlier = await prisma.learningNoteReply.findMany({ where: { noteId: note.id }, distinct: ['authorId'], select: { authorId: true } });
    const recipients = new Map<string, 'learning_note_reply' | 'mention'>();
    for (const id of [note.user.id, ...earlier.map((r) => r.authorId)]) recipients.set(id, 'learning_note_reply');
    for (const m of tagged) if (!recipients.has(m.id)) recipients.set(m.id, 'mention');
    await notifyReply(note, actor, text, recipients);
    return res.status(201).json({ reply });
  } catch (err) {
    next(err);
  }
});

/** A reply's writer may set it right — only they: a moderator removes, never rewrites. */
router.put('/:noteId/replies/:replyId', validate(replySchema), async (req, res, next) => {
  try {
    const { text, mentions } = req.body as z.infer<typeof replySchema>;
    const actor = req.user!;
    const where = { id: req.params.replyId, noteId: req.params.noteId, authorId: actor.id };
    const before = await prisma.learningNoteReply.findFirst({ where, select: { mentionIds: true } });
    if (!before) throw new HttpError(404, 'الردّ غير موجود');
    // Tags still in the text stay; names deleted from it drop theirs; only new ones are told.
    const tagged = await resolveMentions(text, mentions, actor.id, before.mentionIds);
    const row = await prisma.learningNoteReply.update({ where: { id: req.params.replyId }, data: { text, mentionIds: tagged.map((m) => m.id) }, select: REPLY_SELECT });
    const fresh = tagged.filter((m) => !before.mentionIds.includes(m.id));
    if (fresh.length) {
      const note = await visibleNote(req.params.noteId, actor.id);
      if (note.shared) await notifyReply(note, actor, text, new Map(fresh.map((m) => [m.id, 'mention' as const])));
    }
    const [reply] = await repliesOut([row]);
    return res.json({ reply });
  } catch (err) {
    next(err);
  }
});

/** A reply goes by its writer's hand, or a moderator's. */
router.delete('/:noteId/replies/:replyId', async (req, res, next) => {
  try {
    const user = req.user!;
    const where = { id: req.params.replyId, noteId: req.params.noteId, ...(isModerator(user) ? {} : { authorId: user.id }) };
    const { count } = await prisma.learningNoteReply.deleteMany({ where });
    if (count === 0) throw new HttpError(404, 'الردّ غير موجود');
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * «إخفاء من فوائد الإخوة»: a moderator takes a shared note out of view. It
 * stays the member's own, private again; nothing they wrote is deleted.
 */
router.post('/:noteId/unshare', async (req, res, next) => {
  try {
    if (!isModerator(req.user!)) throw new HttpError(403, 'هذا للمشرفين');
    const { count } = await prisma.learningNote.updateMany({ where: { id: req.params.noteId, shared: true }, data: { shared: false } });
    if (count === 0) throw new HttpError(404, 'الفائدة غير موجودة أو لم تعد مشاركة');
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
