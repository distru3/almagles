import type { Mention } from './types';

/**
 * «@الاسم» in comments and replies. The server keeps who was tagged (ids
 * checked against the text, server/src/lib/mentions.ts); here the tags are
 * found again in the text to link each name to its profile, with the same
 * rule: the whole name, not the tail of an email, and «و@خالد» counts.
 */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type MentionPart = { text: string; mention?: Mention };

/** Text cut into plain runs and «@الاسم» tags, longest names tried first. */
export function splitMentions(text: string, mentions: Mention[] | undefined): MentionPart[] {
  const named = (mentions ?? []).filter((m) => m.name.trim());
  if (!named.length || !text.includes('@')) return [{ text }];
  const byName = new Map(named.map((m) => [m.name, m]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
  const pattern = new RegExp(`(^|[^A-Za-z0-9._%+-])@(${names.join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index + match[1].length;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: `@${match[2]}`, mention: byName.get(match[2]) });
    last = at + 1 + match[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** The picked members whose «@الاسم» is still in the text — what a save sends. */
export function mentionIdsIn(text: string, picked: Mention[]): string[] {
  return splitMentions(text, picked)
    .map((p) => p.mention?.id)
    .filter((id, i, all): id is string => !!id && all.indexOf(id) === i);
}

/**
 * Where the caret is in an unfinished «@…»: the index of the «@» and what's
 * been typed after it. Names have spaces, so a space doesn't end it; a new
 * line, a second «@» or a long run does.
 */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /[\n@]/.test(query) || /^\s/.test(query) || /\s{2}/.test(query)) return null;
  if (at > 0 && /[A-Za-z0-9._%+-]/.test(before[at - 1])) return null;
  return { start: at, query };
}
