import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import type { Post } from '../lib/types';
import { hijriDate } from '../lib/dates';

interface Props {
  className?: string;
  autoFocus?: boolean;
  onSelect?: () => void;
  placeholder?: string;
}

export default function SearchInput({
  className = '',
  autoFocus = false,
  onSelect,
  placeholder = 'ابحث في المنشورات…',
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ items: Post[] }>(`/posts?q=${encodeURIComponent(q)}&limit=6`);
        setResults(res.items);
        setHasSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (postId: string) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    onSelect?.();
    navigate(`/post/${postId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input Field */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute right-3 h-4 w-4 text-muted" />
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-full border border-line/90 bg-surface-2/60 pr-9 pl-8 py-1.5 text-xs font-bold text-fg placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none transition shadow-2xs"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute left-2.5 rounded-full p-0.5 text-muted transition hover:bg-surface-2/60 hover:text-fg"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown directly below input */}
      {isOpen && query.trim() && (
        <div className="absolute top-full right-0 mt-1.5 w-full min-w-[280px] sm:min-w-[340px] max-h-80 overflow-y-auto rounded-2xl border border-line/90 bg-surface shadow-xl z-50 p-2">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span>جارِ البحث…</span>
            </div>
          ) : results.length === 0 && hasSearched ? (
            <div className="py-6 text-center text-xs text-muted">
              لا توجد نتائج مطابقة لـ «{query}»
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => handleSelect(post.id)}
                  className="group flex w-full items-center justify-between gap-2.5 rounded-xl p-2.5 text-right transition hover:bg-surface-2/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted">
                      <span className="font-extrabold text-accent">
                        {post.category.name}
                      </span>
                      <span>•</span>
                      <span>{hijriDate(post.postDate)}</span>
                    </div>
                    <p className="mt-0.5 truncate font-display text-xs font-bold text-fg group-hover:text-accent">
                      {post.title}
                    </p>
                  </div>
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:-translate-x-1 group-hover:text-accent" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
