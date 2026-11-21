import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, List, Type } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import QuranIndexSheet from '../components/quran/QuranIndexSheet';
import QuranMarksSheet from '../components/quran/QuranMarksSheet';
import AyahSheet from '../components/quran/AyahSheet';
import {
  MARK_KINDS,
  PAGE_COUNT,
  arNumber,
  ayahEnd,
  clampPage,
  fetchMarks,
  loadIndex,
  loadLastPage,
  loadPage,
  saveLastPage,
  type Ayah,
  type MarkKind,
  type QuranIndex,
  type QuranMark,
  type QuranPageData,
} from '../lib/quran';

// The reader's text size, shared with posts (key «almagles_text_size»): normal, large, larger.
const TEXT_SIZE_KEY = 'almagles_text_size';
const MUSHAF_SIZES = ['', '!text-[29px] !leading-[2.4]', '!text-[33px] !leading-[2.45]'];

function readTextSize(): number {
  try {
    const n = Number(localStorage.getItem(TEXT_SIZE_KEY));
    return n >= 0 && n < MUSHAF_SIZES.length ? n : 0;
  } catch {
    return 0;
  }
}

type At = { s: number; a: number };
type Block = { kind: 'sura'; s: number; basmala?: string } | { kind: 'ayat'; list: Ayah[] };

/** A page as blocks: a surah's heading (and its basmala) wherever one begins, and runs of ayat between. */
function blocksOf(page: QuranPageData): Block[] {
  const out: Block[] = [];
  for (const ayah of page.ayat) {
    if (ayah.a === 1) out.push({ kind: 'sura', s: ayah.s, basmala: ayah.b });
    const last = out[out.length - 1];
    if (last?.kind === 'ayat') last.list.push(ayah);
    else out.push({ kind: 'ayat', list: [ayah] });
  }
  return out;
}

/**
 * «المصحف»: the Qur'an page by page, as in the Madinah mushaf, in Tanzil's
 * verified Uthmani text. Open to everyone; signed-in members tap an ayah to
 * put «علاماتي» on it. Opens at ?page=, ?sura=, or ?mark= (from a task in
 * «مهامي»), otherwise where this device last read.
 */
export default function QuranPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<QuranIndex | null>(null);
  const [data, setData] = useState<QuranPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<QuranMark[]>([]);
  /** Whether the member's marks have been fetched (always true when signed out). */
  const [marksReady, setMarksReady] = useState(false);
  const [current, setCurrent] = useState<At | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'index' | 'marks' | At | null>(null);
  const [textSize, setTextSize] = useState(readTextSize);
  const pageRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const page = params.has('page') ? clampPage(Number(params.get('page'))) : null;

  const go = useCallback(
    (n: number, at?: At) => {
      setCurrent(at ?? null);
      setSheet(null);
      setParams({ page: String(clampPage(n)) }, { replace: true });
    },
    [setParams],
  );

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch(() => setError('تعذّر تحميل المصحف — تحقّق من اتصالك ثم أعد المحاولة.'));
  }, []);

  useEffect(() => {
    if (!user) {
      setMarks([]);
      setMarksReady(true);
      return;
    }
    let active = true;
    setMarksReady(false);
    fetchMarks()
      .then((m) => active && setMarks(m))
      .catch(() => {
        /* the mushaf still reads without marks */
      })
      .finally(() => active && setMarksReady(true));
    return () => {
      active = false;
    };
  }, [user]);

  // Where to open when the address doesn't name a page yet: a surah, a mark, or the last page read here.
  useEffect(() => {
    if (page !== null || !index) return;
    const sura = Number(params.get('sura'));
    const kind = params.get('mark') as MarkKind | null;
    if (sura >= 1 && sura <= 114) {
      go(index.suras[sura - 1].page, { s: sura, a: 1 });
      return;
    }
    if (kind && kind in MARK_KINDS) {
      if (!marksReady) return; // decide once the member's marks are here
      const found = marks.find((x) => x.kind === kind);
      if (found) go(found.page, { s: found.sura, a: found.aya });
      else {
        setNotice(user ? `لم تضع علامة «${MARK_KINDS[kind].name}» بعد — اضغط على أي آية لتضعها.` : 'سجّل الدخول لتجد علاماتك هنا.');
        go(loadLastPage() ?? 1);
      }
      return;
    }
    go(loadLastPage() ?? 1);
  }, [page, index, params, marks, marksReady, user, go]);

  // Load the page (and warm up its neighbours), remember it, and bring the current ayah into view.
  useEffect(() => {
    if (page === null) return;
    let active = true;
    setData(null);
    setError(null);
    loadPage(page)
      .then((d) => {
        if (!active) return;
        setData(d);
        saveLastPage(page);
        if (page < PAGE_COUNT) void loadPage(page + 1).catch(() => undefined);
        if (page > 1) void loadPage(page - 1).catch(() => undefined);
      })
      .catch(() => active && setError('تعذّر تحميل هذه الصفحة — تحقّق من اتصالك ثم أعد المحاولة.'));
    return () => {
      active = false;
    };
  }, [page]);

  useEffect(() => {
    if (!data) return;
    const el = current ? pageRef.current?.querySelector(`[data-key="${current.s}:${current.a}"]`) : null;
    if (el) el.scrollIntoView({ block: 'center' });
    else window.scrollTo({ top: 0 });
  }, [data, current]);

  // Arrow keys turn pages; in an Arabic mushaf the next page is to the left.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || page === null || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft' && page < PAGE_COUNT) go(page + 1);
      if (e.key === 'ArrowRight' && page > 1) go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, page, go]);

  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  // Turning a page of an Arabic mushaf: a swipe to the right brings the next page.
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || page === null) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    if (dx > 0 && page < PAGE_COUNT) go(page + 1);
    if (dx < 0 && page > 1) go(page - 1);
  };

  const cycleSize = () => {
    const next = (textSize + 1) % MUSHAF_SIZES.length;
    setTextSize(next);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const marksAt = useMemo(() => {
    const m = new Map<string, QuranMark[]>();
    for (const x of marks) (m.get(`${x.sura}:${x.aya}`) ?? m.set(`${x.sura}:${x.aya}`, []).get(`${x.sura}:${x.aya}`)!).push(x);
    return m;
  }, [marks]);

  const surasOnPage = data ? [...new Set(data.ayat.map((a) => a.s))] : [];

  return (
    <div className="container-site max-w-3xl py-8">
      <div className="page-header">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <BookOpen className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-black text-fg">المصحف</h1>
          <p className="text-sm text-muted">بالرسم العثماني، صفحةً صفحة كمصحف المدينة — وضع علاماتك للتلاوة والحفظ والمراجعة والتدبّر.</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSheet('index')} disabled={!index} className="chip">
            <List className="h-4 w-4" aria-hidden="true" />
            الفهرس
          </button>
          <button type="button" onClick={() => setSheet('marks')} disabled={!index} className="chip">
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            علاماتي
          </button>
          <button type="button" onClick={cycleSize} className="chip" aria-label="حجم الخط">
            <Type className="h-4 w-4" aria-hidden="true" />
            {['عادي', 'كبير', 'أكبر'][textSize]}
          </button>
        </div>
        {data && index && (
          <p className="font-display text-sm text-fg-2">
            {surasOnPage.map((s) => index.suras[s - 1].name).join('، ')} · الجزء {arNumber(data.juz)}
          </p>
        )}
      </div>

      {notice && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-xs text-muted hover:text-fg">
            حسنًا
          </button>
        </div>
      )}

      {error ? (
        <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{error}</p>
      ) : !data || !index ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div
          ref={pageRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="rounded-sm border border-line bg-surface px-4 py-5 sm:px-8 sm:py-7"
          lang="ar"
          aria-label={`صفحة ${arNumber(data.page)}`}
        >
          {blocksOf(data).map((block, i) =>
            block.kind === 'sura' ? (
              <div key={`sura-${block.s}`} className={i > 0 ? 'mt-5' : ''}>
                <div className="rounded-sm border border-accent/40 bg-accent-soft/40 py-1.5 text-center">
                  <p className="font-display text-[17px] text-accent">سورة {index.suras[block.s - 1].name}</p>
                  <p className="text-[11px] text-muted">
                    {index.suras[block.s - 1].type} · {arNumber(index.suras[block.s - 1].ayas)} {index.suras[block.s - 1].ayas <= 10 ? 'آيات' : 'آية'}
                  </p>
                </div>
                {block.basmala && <p className={`mushaf mt-3 !text-center ${MUSHAF_SIZES[textSize]}`}>{block.basmala}</p>}
              </div>
            ) : (
              <p key={`ayat-${block.list[0].s}-${block.list[0].a}`} className={`mushaf mt-2 ${MUSHAF_SIZES[textSize]}`}>
                {block.list.map((ayah) => {
                  const key = `${ayah.s}:${ayah.a}`;
                  const here = marksAt.get(key) ?? [];
                  return (
                    <Fragment key={key}>
                      <span
                        role="button"
                        tabIndex={0}
                        data-key={key}
                        data-current={current?.s === ayah.s && current.a === ayah.a}
                        onClick={() => setSheet({ s: ayah.s, a: ayah.a })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSheet({ s: ayah.s, a: ayah.a });
                          }
                        }}
                        className="mushaf-ayah"
                      >
                        {ayah.t} <span className="mushaf-end">{ayahEnd(ayah.a)}</span>
                        {here.map((m) => {
                          const Icon = MARK_KINDS[m.kind].icon;
                          return <Icon key={m.id} className="ms-1 inline h-4 w-4 align-middle text-accent" aria-label={`علامة ${m.label ?? MARK_KINDS[m.kind].name}`} />;
                        })}
                      </span>{' '}
                    </Fragment>
                  );
                })}
              </p>
            ),
          )}
          <p className="mt-4 text-center font-display text-sm text-muted">{arNumber(data.page)}</p>
        </div>
      )}

      {page !== null && (
        <nav aria-label="تقليب الصفحات" className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className="btn-outline">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            السابقة
          </button>
          <span className="font-display text-sm text-fg-2">
            صفحة {arNumber(page)} من {arNumber(PAGE_COUNT)}
          </span>
          <button type="button" onClick={() => go(page + 1)} disabled={page >= PAGE_COUNT} className="btn-outline">
            التالية
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}

      {index && (
        <details className="mt-6 text-center text-xs text-muted">
          <summary className="cursor-pointer">
            النص القرآني من{' '}
            <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-strong">
              مشروع تنزيل (tanzil.net)
            </a>
            ، منقول كما هو دون أي تغيير.
          </summary>
          <pre dir="ltr" className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-sm border border-line bg-surface-2/40 p-3 text-start font-sans text-[11px] leading-5">
            {index.notice.join('\n')}
          </pre>
        </details>
      )}

      {sheet === 'index' && index && page !== null && <QuranIndexSheet index={index} page={page} onGo={go} onClose={() => setSheet(null)} />}
      {sheet === 'marks' && index && (
        <QuranMarksSheet index={index} marks={marks} signedIn={!!user} onGo={go} onMarks={setMarks} onClose={() => setSheet(null)} />
      )}
      {sheet && typeof sheet === 'object' && index && (
        <AyahSheet
          at={sheet}
          index={index}
          marks={marks}
          signedIn={!!user}
          onSaved={(m) => setMarks((prev) => [...prev.filter((x) => x.id !== m.id && (m.kind === 'custom' || x.kind !== m.kind)), m])}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
