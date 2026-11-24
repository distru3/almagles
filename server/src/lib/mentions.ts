import { z } from 'zod';
import { prisma } from '../db.js';

/**
 * «@الاسم»: tagging a member in a comment or in a reply on a shared فائدة.
 * Names have spaces («محمد أحمد»), so a tag isn't guessed from the text: the
 * writer picks the member from the list, the client sends their id, and the
 * text keeps «@الاسم». The server keeps an id only while «@الاسم» is still in
 * the text, so deleting the name drops the tag. Mirrored for display by
 * client/src/lib/mentions.ts.
 */

/** Members one comment or reply may tag — a few brothers, not the whole circle. */
export const MAX_MENTIONS = 10;

/** What a save may send: the ids picked while writing. */
export const mentionsSchema = z.array(z.string().min(1).max(64)).max(MAX_MENTIONS * 2, 'ذكرت إخوة كثيرين').optional();

export type Mentioned = { id: string; name: string };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * «@الاسم» is in the text as a tag: not the start of a longer name, and not
 * the tail of an email address. «و@خالد» counts — the «و» of Arabic joins
 * the word after it.
 */
export function hasMention(text: string, name: string): boolean {
  if (!name.trim()) return false;
  return new RegExp(`(^|[^A-Za-z0-9._%+-])@${escapeRegex(name)}(?![\\p{L}\\p{N}_])`, 'u').test(text);
}

/**
 * The members a text really tags: of the ids sent (and those it already
 * tagged, when edited), the ones whose «@الاسم» is in it — never its writer,
 * at most MAX_MENTIONS.
 */
export async function resolveMentions(text: string, ids: string[] | undefined, authorId: string, kept: string[] = []): Promise<Mentioned[]> {
  const wanted = [...new Set([...kept, ...(ids ?? [])])].filter((id) => id !== authorId);
  if (!wanted.length || !text.includes('@')) return [];
  const users = await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return wanted
    .map((id) => byId.get(id))
    .filter((u): u is Mentioned => !!u && hasMention(text, u.name))
    .slice(0, MAX_MENTIONS);
}

/** Names for the tags of many rows at once, for the client to link «@الاسم» to each profile. */
export async function mentionNames(idLists: string[][]): Promise<(ids: string[]) => Mentioned[]> {
  const all = [...new Set(idLists.flat())];
  const users = all.length ? await prisma.user.findMany({ where: { id: { in: all } }, select: { id: true, name: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return (ids) => ids.map((id) => byId.get(id)).filter((u): u is Mentioned => !!u);
}
