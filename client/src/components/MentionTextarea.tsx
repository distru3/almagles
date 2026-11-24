import { useEffect, useId, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { api } from '../lib/api';
import type { Mention } from '../lib/types';
import { mentionQueryAt } from '../lib/mentions';
import Avatar from './Avatar';

type Suggestion = Mention & { avatarUrl: string | null };

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (text: string) => void;
  /** A member chosen from the «@» list; the save sends those whose name is still in the text. */
  onMention: (m: Mention) => void;
  /** Layout for the box around the textarea and its list, e.g. `flex-1` in a row. */
  wrapperClassName?: string;
};

/**
 * A textarea where «@» brings up the brothers by name: keep typing to narrow
 * it, ↑ ↓ to move, Enter or Tab (or a tap) to tag one — «@الاسم» goes into
 * the text — and Esc to write on. Everything else behaves as the plain
 * textarea it replaces, its own keys included.
 */
export default function MentionTextarea({ value, onChange, onMention, onKeyDown, className = '', wrapperClassName = '', ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const open = at !== null && results.length > 0;

  const look = () => {
    const el = ref.current;
    if (!el) return;
    setAt(el.selectionStart === el.selectionEnd ? mentionQueryAt(el.value, el.selectionStart) : null);
  };

  useEffect(() => {
    if (at === null) {
      setResults([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api<{ users: Suggestion[] }>(`/users/mentionable${at.query.trim() ? `?q=${encodeURIComponent(at.query.trim())}` : ''}`)
        .then((res) => {
          if (!live) return;
          setResults(res.users);
          setActive(0);
        })
        .catch(() => live && setResults([]));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [at?.start, at?.query]);

  const choose = (u: Suggestion) => {
    const el = ref.current;
    if (!el || !at) return;
    const caret = el.selectionStart;
    const inserted = `@${u.name} `;
    const next = value.slice(0, at.start) + inserted + value.slice(caret).replace(/^ /, '');
    onChange(next);
    onMention({ id: u.id, name: u.name });
    setAt(null);
    const pos = at.start + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        choose(results[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setAt(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <textarea
        {...rest}
        ref={ref}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(look);
        }}
        onKeyDown={keyDown}
        onKeyUp={(e) => {
          if (e.key.startsWith('Arrow') && !open) look();
        }}
        onClick={look}
        onBlur={() => setAt(null)}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="اذكر أخًا"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
        >
          {results.map((u, i) => (
            <li
              key={u.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: choosing mustn't blur the textarea first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(u);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-start ${i === active ? 'bg-accent-soft text-fg' : 'text-fg-2'}`}
            >
              <Avatar name={u.name} src={u.avatarUrl} size="xs" />
              <span className="font-display text-sm">{u.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
