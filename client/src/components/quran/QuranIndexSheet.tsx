import { useMemo, useState, type FormEvent } from 'react';
import { normalizeArabic } from '../../lib/fadail';
import { PAGE_COUNT, arNumber, clampPage, type QuranIndex } from '../../lib/quran';
import QuranSheet from './QuranSheet';

type Go = (page: number, at?: { s: number; a: number }) => void;

/** «الفهرس»: jump to a page, a surah, or a juz'. */
export default function QuranIndexSheet({ index, page, onGo, onClose }: { index: QuranIndex; page: number; onGo: Go; onClose: () => void }) {
  const [tab, setTab] = useState<'suras' | 'juzs'>('suras');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(String(page));

  const suras = useMemo(() => {
    const q = normalizeArabic(query.trim());
    return q ? index.suras.filter((s) => normalizeArabic(s.name).includes(q) || String(s.n) === q) : index.suras;
  }, [index, query]);

  const jump = (e: FormEvent) => {
    e.preventDefault();
    onGo(clampPage(Number(target)));
  };

  return (
    <QuranSheet title="الفهرس" onClose={onClose}>
      <form onSubmit={jump} className="mb-3 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="quran-page" className="label !text-xs">
            اذهب إلى صفحة (١–{arNumber(PAGE_COUNT)})
          </label>
          <input id="quran-page" type="number" inputMode="numeric" min={1} max={PAGE_COUNT} value={target} onChange={(e) => setTarget(e.target.value)} className="input !h-10" />
        </div>
        <button type="submit" className="btn-primary !min-h-10">
          اذهب
        </button>
      </form>

      <div role="tablist" aria-label="الفهرس" className="mb-2 flex gap-2">
        {(
          [
            ['suras', 'السور'],
            ['juzs', 'الأجزاء'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-9 rounded-full px-4 font-display text-sm transition ${tab === key ? 'bg-accent-fill text-on-accent' : 'text-fg-2 hover:bg-surface-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'suras' ? (
        <>
          <label htmlFor="quran-sura-search" className="sr-only">
            ابحث عن سورة
          </label>
          <input id="quran-sura-search" type="search" placeholder="ابحث عن سورة…" value={query} onChange={(e) => setQuery(e.target.value)} className="input mb-2 !h-10" />
          <ul className="divide-y divide-line">
            {suras.map((s) => (
              <li key={s.n}>
                <button type="button" onClick={() => onGo(s.page, { s: s.n, a: 1 })} className="flex w-full items-center gap-3 py-2 text-start hover:text-accent">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-xs text-fg-2">{arNumber(s.n)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px]">سورة {s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.type} · {arNumber(s.ayas)} {s.ayas >= 3 && s.ayas <= 10 ? 'آيات' : 'آية'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">ص {arNumber(s.page)}</span>
                </button>
              </li>
            ))}
            {suras.length === 0 && <li className="py-6 text-center text-sm text-muted">لا توجد سورة بهذا الاسم.</li>}
          </ul>
        </>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {index.juzs.map((j) => (
            <li key={j.n}>
              <button
                type="button"
                onClick={() => onGo(j.page, { s: j.s, a: j.a })}
                className="w-full rounded-sm border border-line px-3 py-2 text-start transition hover:border-accent hover:text-accent"
              >
                <span className="block font-display text-[15px]">الجزء {arNumber(j.n)}</span>
                <span className="block text-xs text-muted">
                  {index.suras[j.s - 1].name} {arNumber(j.a)} · ص {arNumber(j.page)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </QuranSheet>
  );
}
