import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { pushToUsers } from '../lib/push.js';

/**
 * «فوائد الإخوة»: the fawa'id members chose to share from «رحلة العلم», and
 * the discussion under each. A note is written and shared from the member's
 * own lesson (routes/learning.ts); here the brothers read it and reply. A
 * private note is never served here, not even its replies.
 */
const router = Router();
router.use(requireAuth);

const EXCERPT_LENGTH = 120;

const AUTHOR = { select: { id: true, name: true, avatarUrl: true } } as const;
const SHARED_NOTE_SELECT = {
  id: true,
  text: true,
  createdAt: true,
  updatedAt: true,
  completion: { select: { user: AUTHOR, item: { select: { id: true, title: true, portion: true, date: true, kind: true } } } },
  _count: { select: { replies: true } },
} as const;
const REPLY_SELECT = { id: true, text: true, createdAt: true, author: AUTHOR } as const;

type SharedNoteRow = {
  id: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  completion: { user: { id: string; name: string; avatarUrl: string | null }; item: { id: string; title: string; portion: string | null; date: string; kind: string } };
  _count: { replies: number };
};
const sharedOut = ({ completion, _count, ...n }: SharedNoteRow) => ({ ...n, author: completion.user, lesson: completion.item, replyCount: _count.replies });

/** Admins and the journey's supervisors keep the discussion clean. */
const isModerator = (user: { role: string; canManageSchedule: boolean }) => user.role === 'admin' || user.canManageSchedule;

/** The note, if it's shared — or the reader's own. */
async function visibleNote(noteId: string, userId: string) {
  const note = await prisma.learningNote.findUnique({ where: { id: noteId }, select: { ...SHARED_NOTE_SELECT, shared: true } });
  if (!note || (!note.shared && note.completion.user.id !== userId)) throw new HttpError(404, 'الفائدة غير موجودة أو لم تعد مشاركة');
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
      where: { shared: true, ...(itemId ? { completion: { itemId } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: SHARED_NOTE_SELECT,
    });
    const page = rows.slice(0, limit);
    return res.json({ notes: page.map(sharedOut), nextCursor: rows.length > limit ? page[page.length - 1].id : null });
  } catch (err) {
    next(err);
  }
});

/** One shared فائدة with its discussion, oldest reply first. */
router.get('/:noteId', async (req, res, next) => {
  try {
    const { shared, ...note } = await visibleNote(req.params.noteId, req.user!.id);
    const replies = await prisma.learningNoteReply.findMany({ where: { noteId: note.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: REPLY_SELECT });
    return res.json({ note: { ...sharedOut(note), shared }, replies });
  } catch (err) {
    next(err);
  }
});

const replySchema = z.object({ text: z.string().trim().min(1, 'اكتب ردّك أولاً').max(1000, 'الردّ طويل — اختصره') });

/**
 * A reply under a shared فائدة. Its writer and everyone already in the
 * discussion hear of it, as with replies on a post.
 */
router.post('/:noteId/replies', validate(replySchema), async (req, res, next) => {
  try {
    const { text } = req.body as z.infer<typeof replySchema>;
    const actor = req.user!;
    const note = await visibleNote(req.params.noteId, actor.id);
    if (!note.shared) throw new HttpError(400, 'شارك الفائدة أولاً ليتحاور فيها إخوانك');
    const reply = await prisma.learningNoteReply.create({ data: { noteId: note.id, authorId: actor.id, text }, select: REPLY_SELECT });

    const earlier = await prisma.learningNoteReply.findMany({ where: { noteId: note.id }, distinct: ['authorId'], select: { authorId: true } });
    const writerId = note.completion.user.id;
    const recipients = new Set([writerId, ...earlier.map((r) => r.authorId)]);
    recipients.delete(actor.id);
    if (recipients.size) {
      const excerpt = text.slice(0, EXCERPT_LENGTH);
      const rows = await prisma.notification.createManyAndReturn({
        data: [...recipients].map((userId) => ({ type: 'learning_note_reply' as const, userId, actorId: actor.id, learningNoteId: note.id, message: excerpt })),
        select: { id: true, userId: true },
      });
      const lesson = `«${note.completion.item.title}»`;
      pushToUsers(
        rows.map((n) => ({
          userId: n.userId,
          payload: {
            title: 'رجال الأمة',
            body: `${n.userId === writerId ? `${actor.name} ردّ على فائدتك في ${lesson}` : `${actor.name} ردّ في نقاش فائدة على ${lesson}`}\n${excerpt}`,
            url: `/learn?tab=fawaid&note=${note.id}&n=${n.id}`,
            tag: `learning-note:${note.id}`,
          },
        })),
      );
    }
    return res.status(201).json({ reply });
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
