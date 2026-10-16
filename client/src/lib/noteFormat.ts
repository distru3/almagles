/**
 * Light list syntax for plain-text notes. Writers type (or the toolbar inserts)
 * "- " / "• " for bullets and "1- " / "١. " for numbered points; the reader
 * renders those lines as lists. Everything else stays plain text.
 */

export const NOTE_MAX = 20000;

export type ListMarker = { kind: 'bullet' | 'number'; indent: number; marker: string; body: string; prefix: string };

const BULLET = /^([ \t]*)([-•*·▪◦–])[ \t]+(.*)$/;
// Western, Arabic-Indic or Persian digits followed by . ) - or ـ
const NUMBER = /^([ \t]*)([0-9٠-٩۰-۹]{1,3})[ \t]*([.)\-–ـ])[ \t]+(.*)$/;

export function parseListLine(line: string): ListMarker | null {
  const b = BULLET.exec(line);
  if (b) return { kind: 'bullet', indent: indentLevel(b[1]), marker: b[2], body: b[3], prefix: line.slice(0, line.length - b[3].length) };
  const n = NUMBER.exec(line);
  if (n) return { kind: 'number', indent: indentLevel(n[1]), marker: n[2] + n[3], body: n[4], prefix: line.slice(0, line.length - n[4].length) };
  return null;
}

function indentLevel(ws: string): number {
  const cols = ws.replace(/\t/g, '  ').length;
  return Math.min(3, Math.floor(cols / 2));
}

const DIGIT_SETS = ['0123456789', '٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹'];

/** "3-" → "4-", "٩." → "١٠." — keeping the writer's digit style. */
export function nextNumberMarker(marker: string): string {
  const sep = marker.slice(-1);
  const digits = marker.slice(0, -1);
  const set = DIGIT_SETS.find((s) => s.includes(digits[0])) ?? DIGIT_SETS[0];
  const value = Number([...digits].map((d) => set.indexOf(d)).join('')) + 1;
  return [...String(value)].map((d) => set[Number(d)]).join('') + sep;
}

export type NoteBlock =
  | { type: 'para'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: { marker: string; indent: number; text: string }[] };

/** Group a note's lines into paragraphs and lists. */
export function parseNote(content: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    const item = parseListLine(line);
    const last = blocks[blocks.length - 1];
    if (item) {
      const ordered = item.kind === 'number';
      if (last?.type === 'list' && (last.ordered === ordered || item.indent > 0)) {
        last.items.push({ marker: item.marker, indent: item.indent, text: item.body });
      } else {
        blocks.push({ type: 'list', ordered, items: [{ marker: item.marker, indent: item.indent, text: item.body }] });
      }
    } else if (line.trim() === '') {
      // A blank line ends the current block; runs of blanks collapse.
      if (last && !(last.type === 'para' && last.lines.length === 0)) blocks.push({ type: 'para', lines: [] });
    } else if (last?.type === 'para') {
      last.lines.push(line);
    } else if (last?.type === 'list' && /^[ \t]{2,}\S/.test(line)) {
      // An indented line under a point continues that point.
      last.items[last.items.length - 1].text += `\n${line.trim()}`;
    } else {
      blocks.push({ type: 'para', lines: [line] });
    }
  }
  return blocks.filter((b) => b.type === 'list' || b.lines.length > 0);
}

/** Toggle a list marker on every line the selection touches. */
export function toggleList(
  value: string,
  selStart: number,
  selEnd: number,
  kind: 'bullet' | 'number',
): { value: string; start: number; end: number } {
  const from = value.lastIndexOf('\n', selStart - 1) + 1;
  let to = value.indexOf('\n', selEnd > selStart && value[selEnd - 1] === '\n' ? selEnd - 1 : selEnd);
  if (to === -1) to = value.length;
  const lines = value.slice(from, to).split('\n');
  const content = lines.filter((l) => l.trim() !== '');
  const allAlready = content.length > 0 && content.every((l) => parseListLine(l)?.kind === kind);

  let n = 0;
  const next = lines.map((line) => {
    const item = parseListLine(line);
    if (allAlready) return item ? line.slice(0, line.length - item.body.length - item.prefix.trimStart().length) + item.body : line;
    if (line.trim() === '' && lines.length > 1) return line;
    const indent = /^[ \t]*/.exec(line)![0];
    const body = item ? item.body : line.trimStart();
    n += 1;
    return `${indent}${kind === 'bullet' ? '•' : `${n}-`} ${body}`;
  });
  const replaced = next.join('\n');
  const out = value.slice(0, from) + replaced + value.slice(to);
  // A single empty line: leave the cursor after the new marker.
  const caret = from + replaced.length;
  return selStart === selEnd && lines.length === 1 ? { value: out, start: caret, end: caret } : { value: out, start: from, end: caret };
}

/**
 * Enter inside a list point: continue the list on the next line, or end the
 * list when the point is empty. Returns null to let Enter behave normally.
 */
export function continueList(value: string, caret: number): { value: string; caret: number } | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const item = parseListLine(value.slice(lineStart, caret));
  if (!item) return null;
  if (item.body.trim() === '') {
    // Empty point: drop its marker instead of adding another.
    return { value: value.slice(0, lineStart) + value.slice(caret), caret: lineStart };
  }
  const indent = item.prefix.match(/^[ \t]*/)![0];
  const marker = item.kind === 'bullet' ? item.marker : nextNumberMarker(item.marker);
  const insert = `\n${indent}${marker} `;
  return { value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length };
}
