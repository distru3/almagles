import AyahText, { splitAyah } from '../AyahText';
import { parseNote } from '../../lib/noteFormat';

/**
 * A council note rendered for reading: "- " / "1- " lines become lists with
 * hanging indents, blank lines separate paragraphs, ﴿ ﴾ is highlighted even
 * when a verse runs across lines. `pdfRows` lets the PDF export break pages
 * between points instead of through them.
 */
export default function NoteText({ content, compact = false, pdfRows = false }: { content: string; compact?: boolean; pdfRows?: boolean }) {
  const row = pdfRows ? { 'data-pdf-row': '' } : {};
  let inside = false;
  const ayah = (text: string) => {
    const start = inside;
    inside = splitAyah(text, start).inside;
    return <AyahText text={text} inside={start} />;
  };

  return (
    <div className={`[overflow-wrap:anywhere] ${compact ? 'space-y-1' : 'space-y-2.5'}`}>
      {parseNote(content).map((block, b) => {
        if (block.type === 'para') {
          return (
            <p key={b} {...row} className="whitespace-pre-line">
              {ayah(block.lines.join('\n'))}
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={b} role="list" className={compact ? 'space-y-0.5' : 'space-y-1.5'}>
            {block.items.map((item, i) => (
              <li
                key={i}
                {...row}
                className={`flex ${compact ? 'gap-1.5' : 'gap-2.5'}`}
                style={item.indent ? { marginInlineStart: `${item.indent * (compact ? 0.75 : 1.25)}rem` } : undefined}
              >
                <span
                  aria-hidden={!block.ordered}
                  className={`shrink-0 font-display text-accent ${block.ordered ? 'min-w-[1.4em] tabular-nums' : ''}`}
                >
                  {block.ordered ? item.marker : item.indent > 0 ? '◦' : '•'}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-line">
                  {ayah(item.text)}
                </span>
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
