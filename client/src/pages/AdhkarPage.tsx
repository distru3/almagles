import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Sun,
  Moon,
  Bed,
  Copy,
  Check,
  Printer,
  RotateCcw,
  Sparkles,
  Clock,
  ArrowRight,
  ListChecks,
  CheckCircle2,
  BellRing,
} from 'lucide-react';
import { ADHKAR_DATA } from '../lib/adhkarData';
import OrnateDivider from '../components/adhkar/OrnateDivider';
import DhikrCounter from '../components/adhkar/DhikrCounter';
import AdhkarReminderCard from '../components/adhkar/AdhkarReminderCard';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { MyTask, MyTasks } from '../lib/types';
import { loadPlace, prayerClockFor } from '../lib/prayerTimes';
import { todayISO } from '../lib/dates';
import { nowHHMM } from '../lib/taskSchedule';

type AdhkarType = 'morning' | 'evening' | 'sleep';

// Consistent font sizing with PostPage.tsx
const TEXT_SIZES = [
  { label: 'عادي', className: 'text-[17px] sm:text-[18px] leading-[2.05]' },
  { label: 'كبير', className: 'text-[19px] sm:text-[21px] leading-[2.15]' },
  { label: 'عريض', className: 'text-[22px] sm:text-[24px] leading-[2.2]' },
] as const;
const TEXT_SIZE_KEY = 'almagles_text_size';

function readTextSize(): number {
  try {
    const n = Number(localStorage.getItem(TEXT_SIZE_KEY));
    return n >= 0 && n < TEXT_SIZES.length ? n : 0;
  } catch {
    return 0;
  }
}

export default function AdhkarPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  const activeType: AdhkarType =
    rawType === 'evening' || rawType === 'sleep' ? rawType : 'morning';

  const data = useMemo(() => ADHKAR_DATA[activeType], [activeType]);

  // Per-dhikr tap counts state
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedTargets, setSelectedTargets] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const [textSize, setTextSize] = useState(readTextSize);

  const getTarget = useCallback(
    (id: string, defaultCount: number) => selectedTargets[id] ?? defaultCount,
    [selectedTargets]
  );

  const handleSelectTarget = (id: string, newTarget: number) => {
    setSelectedTargets((prev) => ({ ...prev, [id]: newTarget }));
  };

  // Member tasks integration state
  const [userTasks, setUserTasks] = useState<MyTask[]>([]);
  const [taskUpdatedToast, setTaskUpdatedToast] = useState<string | null>(null);
  const [syncingTask, setSyncingTask] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);

  // Font size cycle matching PostPage
  const cycleTextSize = () => {
    const next = (textSize + 1) % TEXT_SIZES.length;
    setTextSize(next);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  // Load member's tasks to link adhkar completion
  const loadMemberTasks = useCallback(async () => {
    if (!user) return;
    try {
      // Fajr and Isha where the member is: a linked task may be «قيام الليل» (Isha → Fajr).
      const { fajr, isha } = prayerClockFor(loadPlace());
      const res = await api<MyTasks>(`/tasks?date=${todayISO()}&time=${nowHHMM()}&fajr=${fajr}&isha=${isha}`);
      setUserTasks(res.tasks ?? []);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void loadMemberTasks();
  }, [loadMemberTasks]);

  // Find matching task for current active adhkar
  const matchingTask = useMemo(() => {
    if (!userTasks.length) return null;
    const keywords =
      activeType === 'morning'
        ? ['أذكار الصباح', 'اذكار الصباح', 'الصباح', 'صباح']
        : activeType === 'evening'
        ? ['أذكار المساء', 'اذكار المساء', 'المساء', 'مساء']
        : ['أذكار النوم', 'اذكار النوم', 'النوم', 'نوم', 'الوتر'];

    return (
      userTasks.find((t) => {
        const text = `${t.title} ${t.description || ''}`;
        return keywords.some((kw) => text.includes(kw));
      }) ?? null
    );
  }, [userTasks, activeType]);

  // Calculate total items and completed items for progress tracking
  const totalItems = useMemo(() => {
    let sum = 1; // Kursi
    sum += data.topSection.muawwidhat.length;
    if (data.topSection.extraQuran) sum += data.topSection.extraQuran.length;
    sum += data.singleSection.length;
    sum += data.repeatedSection.length;
    return sum;
  }, [data]);

  const completedCount = useMemo(() => {
    let done = 0;
    if ((counts[data.topSection.kursi.id] || 0) >= data.topSection.kursi.count) done += 1;
    data.topSection.muawwidhat.forEach((m) => {
      if ((counts[m.id] || 0) >= m.count) done += 1;
    });
    data.topSection.extraQuran?.forEach((eq) => {
      if ((counts[eq.id] || 0) >= eq.count) done += 1;
    });
    data.singleSection.forEach((s) => {
      if ((counts[s.id] || 0) >= s.count) done += 1;
    });
    data.repeatedSection.forEach((r) => {
      const target = getTarget(r.id, r.count);
      if ((counts[r.id] || 0) >= target) done += 1;
    });
    return done;
  }, [counts, data, getTarget]);

  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;
  const isEntireWardCompleted = completedCount >= totalItems && totalItems > 0;

  // Complete matching task
  const completeMatchingTask = useCallback(async () => {
    if (!matchingTask || matchingTask.done || syncingTask) return;
    setSyncingTask(true);
    try {
      await api(`/tasks/${matchingTask.id}/done`, {
        method: 'PUT',
        body: { date: todayISO(), time: nowHHMM(), done: true, ...prayerClockFor(loadPlace()) },
      });
      setUserTasks((prev) =>
        prev.map((t) => (t.id === matchingTask.id ? { ...t, done: true } : t))
      );
      setTaskUpdatedToast(
        `تم إتمام ${data.title} وتسجيلها في قائمة مهامك بنجاح (+${matchingTask.points} نقطة)`
      );
      setTimeout(() => setTaskUpdatedToast(null), 4500);
    } catch {
      /* ignore */
    } finally {
      setSyncingTask(false);
    }
  }, [matchingTask, syncingTask, data.title]);

  // Auto-complete task when all items are ticked
  useEffect(() => {
    if (isEntireWardCompleted && matchingTask && !matchingTask.done) {
      void completeMatchingTask();
    }
  }, [isEntireWardCompleted, matchingTask, completeMatchingTask]);

  // Change tab
  const handleTabChange = (type: AdhkarType) => {
    setSearchParams({ type });
    setCounts({});
  };

  // Increment dhikr count
  const handleIncrement = (id: string, defaultMax: number) => {
    const target = getTarget(id, defaultMax);
    setCounts((prev) => {
      const current = prev[id] || 0;
      if (current >= target) return prev;
      return { ...prev, [id]: current + 1 };
    });
  };

  // Mark all items as done at once
  const handleCompleteAll = () => {
    const allCounts: Record<string, number> = {};
    allCounts[data.topSection.kursi.id] = data.topSection.kursi.count;
    data.topSection.muawwidhat.forEach((m) => {
      allCounts[m.id] = m.count;
    });
    data.topSection.extraQuran?.forEach((eq) => {
      allCounts[eq.id] = eq.count;
    });
    data.singleSection.forEach((s) => {
      allCounts[s.id] = s.count;
    });
    data.repeatedSection.forEach((r) => {
      allCounts[r.id] = getTarget(r.id, r.count);
    });
    setCounts(allCounts);
    if (matchingTask) {
      setTaskUpdatedToast(
        `تم إتمام ${data.title} وتسجيلها في قائمة مهامك بنجاح (+${matchingTask.points} نقطة)`
      );
    } else {
      setTaskUpdatedToast(`تم إتمام ${data.title}، تقبّل الله طاعتكم`);
    }
    setTimeout(() => setTaskUpdatedToast(null), 4500);
    void completeMatchingTask();
  };

  // Reset counters
  const handleReset = () => {
    setCounts({});
  };

  // Copy full text
  const handleCopyAll = async () => {
    try {
      const lines: string[] = [
        `*** ${data.title} ***`,
        data.subtitle,
        data.timeframe,
        '',
        '--- آية الكرسي والمعوذات ---',
        data.topSection.kursi.text,
        ...data.topSection.muawwidhat.map((m) => `${m.countLabel || ''}: ${m.text}`),
        ...(data.topSection.extraQuran?.map((eq) => `${eq.countLabel || ''}: ${eq.text}`) ?? []),
        '',
        '--- أذكار تقال مرة واحدة ---',
        ...data.singleSection.map((s) => `• ${s.text}`),
        '',
        '--- أذكار مكررة ---',
        ...data.repeatedSection.map((r) => `• ${r.text} (${r.countLabel || `${r.count} مرات`})`),
        '',
        'من موقع رجال الأمة',
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* ignore */
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const textSizeClass = TEXT_SIZES[textSize].className;

  return (
    <div className="container-site px-3 sm:px-6 py-6 sm:py-8">
      {/* Toast Alert matching site standard design */}
      {taskUpdatedToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-2xl sm:rounded-full bg-fg px-4 sm:px-5 py-2.5 font-display text-xs sm:text-sm text-canvas shadow-xl pointer-events-none transition duration-200 text-center sm:text-start"
        >
          <Check className="h-4 w-4 text-accent shrink-0" strokeWidth={2.5} />
          <span className="leading-snug">{taskUpdatedToast}</span>
        </div>
      )}

      {/* Breadcrumb & Tools Bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-bold text-muted transition hover:text-accent"
        >
          <ArrowRight className="h-4 w-4" />
          <span>الرئيسية</span>
        </Link>

        {/* Font size & Tools Bar - Consistent with PostPage */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Font size button matching PostPage */}
          <button
            type="button"
            onClick={cycleTextSize}
            className="flex h-9 min-w-9 sm:h-10 sm:min-w-10 items-center justify-center rounded-full px-2.5 font-display text-fg-2 transition hover:bg-surface-2 hover:text-fg border border-line bg-surface shadow-2xs"
            aria-label={`حجم الخط: ${TEXT_SIZES[textSize].label}`}
            title={`حجم الخط (${TEXT_SIZES[textSize].label})`}
          >
            <span className="text-[17px] font-bold">أ</span>
            <span className="text-[12px] font-semibold text-muted">أ</span>
          </button>

          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-fg-2 shadow-2xs transition hover:bg-surface-2 hover:text-fg"
            title="نسخ نص الأذكار كاملاً"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-accent" />}
            <span className="hidden md:inline">{copied ? 'تم النسخ' : 'نسخ النص'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-fg-2 shadow-2xs transition hover:bg-surface-2 hover:text-fg"
            title="طباعة الأذكار"
          >
            <Printer className="h-3.5 w-3.5 text-accent" />
            <span className="hidden md:inline">طباعة</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRemindersModal(true)}
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-fg-2 shadow-2xs transition hover:bg-surface-2 hover:text-fg"
            title="ضبط تنبيهات مواعيد الأذكار"
          >
            <BellRing className="h-3.5 w-3.5 text-accent" />
            <span className="hidden sm:inline">التذكير بالأذكار</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted transition hover:bg-surface-2 hover:text-fg"
            title="إعادة ضبط العدادات"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">تصفير</span>
          </button>
        </div>
      </div>

      {/* Main Tab Strip - Mobile Optimized with Segmented Pills */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex max-w-full items-center justify-center gap-1 rounded-2xl border border-line-strong bg-surface p-1 shadow-2xs overflow-x-auto">
          <button
            type="button"
            onClick={() => handleTabChange('morning')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-3.5 sm:px-5 py-2 font-display text-[14px] sm:text-[15px] font-bold transition active:scale-95 ${
              activeType === 'morning'
                ? 'bg-accent-fill text-on-accent shadow-sm'
                : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <Sun className="h-4 w-4" />
            <span>أذكار الصباح</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('evening')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-3.5 sm:px-5 py-2 font-display text-[14px] sm:text-[15px] font-bold transition active:scale-95 ${
              activeType === 'evening'
                ? 'bg-accent-fill text-on-accent shadow-sm'
                : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <Moon className="h-4 w-4" />
            <span>أذكار المساء</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('sleep')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-3.5 sm:px-5 py-2 font-display text-[14px] sm:text-[15px] font-bold transition active:scale-95 ${
              activeType === 'sleep'
                ? 'bg-accent-fill text-on-accent shadow-sm'
                : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <Bed className="h-4 w-4" />
            <span>أذكار النوم</span>
          </button>
        </div>
      </div>

      {/* Adhkar Reminders Settings Modal */}
      {showRemindersModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowRemindersModal(false)}
        >
          <div
            className="relative w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <AdhkarReminderCard onClose={() => setShowRemindersModal(false)} />
          </div>
        </div>
      )}

      {/* The Adhkar Card Container */}
      <article className="mx-auto max-w-[860px] rounded-2xl sm:rounded-3xl border border-line-strong/80 bg-surface/95 p-4 sm:p-8 md:p-10 shadow-xs">
        {/* Header Block matching the poster */}
        <header className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-accent">
            <Sparkles className="h-4 w-4" />
            <span className="font-display text-[11px] sm:text-xs font-extrabold tracking-widest text-accent">
              حِصْنُ المُسْلِم
            </span>
            <Sparkles className="h-4 w-4" />
          </div>

          <h1 className="font-display text-3xl font-black tracking-tight text-fg sm:text-5xl lg:text-6xl">
            {data.title}
          </h1>

          <p className="mt-2 font-display text-sm font-medium text-fg-2 sm:text-base">
            {data.subtitle}
          </p>

          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-0.5 text-[11px] sm:text-xs font-bold text-muted">
            <Clock className="h-3 w-3 text-accent" />
            <span>{data.timeframe}</span>
          </div>

          {/* Overall Reading Progress Bar */}
          <div className="mt-5 mx-auto max-w-sm rounded-xl border border-line bg-canvas/60 p-2.5">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-fg-2">
                أُنجز {completedCount} من {totalItems} ذكراً
              </span>
              <span className="text-accent">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent-fill transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Member Task Connection Badge */}
          {user && matchingTask && (
            <div className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft/40 px-3.5 py-1 text-xs font-bold text-fg">
              <ListChecks className="h-3.5 w-3.5 text-accent" />
              <span>مهمة اليوم: «{matchingTask.title}»</span>
              {matchingTask.done ? (
                <span className="inline-flex items-center gap-1 text-success font-black">
                  <Check className="h-3 w-3" strokeWidth={3} />
                  مُكتملة
                </span>
              ) : (
                <span className="text-accent font-black">+{matchingTask.points} نقطة عند الإتمام</span>
              )}
            </div>
          )}
        </header>

        {/* Decorative Divider */}
        <OrnateDivider />

        {/* SECTION 1: Top Dual Grid (Ayah Al-Kursi & Al-Mu'awwidhat) */}
        <section aria-label="آية الكرسي والمعوذات" className="mb-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card 1: Ayah Al-Kursi */}
            <div
              onClick={() => handleIncrement(data.topSection.kursi.id, data.topSection.kursi.count)}
              className="group relative flex flex-col justify-between rounded-2xl border border-line bg-canvas/60 p-4 sm:p-5 transition hover:border-line-strong cursor-pointer"
            >
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-line/80 pb-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-accent">
                    آية الكرسي
                  </h2>
                  <DhikrCounter
                    id={data.topSection.kursi.id}
                    count={counts[data.topSection.kursi.id] || 0}
                    maxCount={data.topSection.kursi.count}
                    countLabel={data.topSection.kursi.countLabel}
                    onIncrement={() => handleIncrement(data.topSection.kursi.id, data.topSection.kursi.count)}
                  />
                </div>

                <p className={`font-sans font-normal text-fg ${textSizeClass}`}>
                  <span className="ayah">{data.topSection.kursi.text}</span>
                </p>
              </div>

              {data.topSection.kursi.source && (
                <div className="mt-3 border-t border-line/60 pt-2 text-left text-xs font-bold text-muted">
                  {data.topSection.kursi.source}
                </div>
              )}
            </div>

            {/* Card 2: Al-Ikhlas & Al-Mu'awwidhat */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-line bg-canvas/60 p-4 sm:p-5 transition hover:border-line-strong">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-line/80 pb-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-accent">
                    الإخلاص والمعوذتين
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 font-display text-xs font-black text-accent">
                    ٣ مرات
                  </span>
                </div>

                <ul className="space-y-3.5">
                  {data.topSection.muawwidhat.map((m) => (
                    <li
                      key={m.id}
                      onClick={() => handleIncrement(m.id, m.count)}
                      className="flex items-start justify-between gap-3 p-2 rounded-xl transition hover:bg-surface/50 cursor-pointer"
                    >
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <div className="flex-1">
                          <p className={`font-sans font-normal text-fg ${textSizeClass}`}>
                            <span className={m.isQuran ? 'ayah' : 'text-fg'}>{m.text}</span>
                          </p>
                          {m.source && (
                            <span className="mt-0.5 block text-xs font-bold text-muted">
                              {m.source}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 pt-1">
                        <DhikrCounter
                          id={m.id}
                          count={counts[m.id] || 0}
                          maxCount={m.count}
                          countLabel={m.countLabel}
                          onIncrement={() => handleIncrement(m.id, m.count)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-xs text-muted">
                <span>تكرر ثلاثاً حين تصبح وحين تمسي</span>
              </div>
            </div>
          </div>

          {/* Extra Quranic recitations (for Sleep) */}
          {data.topSection.extraQuran && data.topSection.extraQuran.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.topSection.extraQuran.map((eq) => (
                <div
                  key={eq.id}
                  onClick={() => handleIncrement(eq.id, eq.count)}
                  className="rounded-2xl border border-line bg-canvas/60 p-4 sm:p-5 cursor-pointer hover:border-line-strong transition"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-line/80 pb-2">
                    <h3 className="font-display text-sm sm:text-base font-bold text-accent">
                      {eq.source || 'آيات مباركة'}
                    </h3>
                    <DhikrCounter
                      id={eq.id}
                      count={counts[eq.id] || 0}
                      maxCount={eq.count}
                      countLabel={eq.countLabel}
                      onIncrement={() => handleIncrement(eq.id, eq.count)}
                    />
                  </div>
                  <p className={`font-sans font-normal text-fg ${textSizeClass}`}>
                    <span className="ayah">{eq.text}</span>
                  </p>
                  {eq.note && (
                    <div className="mt-2 text-xs font-medium text-muted">
                      {eq.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Decorative Divider */}
        <OrnateDivider />

        {/* SECTION 2: Single-Read Adhkar */}
        <section aria-label="أذكار تقال مرة واحدة" className="mb-4">
          <div className="rounded-2xl border border-line bg-canvas/40 p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between border-b border-line/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-black">
                  ١
                </span>
                <h2 className="font-display text-base sm:text-lg font-bold text-fg">
                  أدعية وأذكار تقال مرة واحدة
                </h2>
              </div>
              <span className="text-xs font-bold text-muted">مرة واحدة</span>
            </div>

            <ul className="divide-y divide-line/60">
              {data.singleSection.map((item) => {
                const isDone = (counts[item.id] || 0) >= 1;
                return (
                  <li
                    key={item.id}
                    onClick={() => handleIncrement(item.id, 1)}
                    className="group relative flex items-start justify-between gap-3 sm:gap-4 py-3.5 first:pt-1 last:pb-1 cursor-pointer transition hover:bg-surface/40 rounded-xl px-1 sm:px-2"
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3 flex-1">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-fill group-hover:scale-125 transition" />
                      <div className="flex-1">
                        <p
                          className={`font-sans text-fg transition ${textSizeClass} ${
                            isDone ? 'opacity-65' : ''
                          }`}
                        >
                          {item.text}
                        </p>
                        {(item.note || item.source) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            {item.note && (
                              <span className="font-medium text-accent">
                                {item.note}
                              </span>
                            )}
                            {item.source && <span>({item.source})</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIncrement(item.id, 1);
                      }}
                      className={`shrink-0 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border-2 transition active:scale-95 ${
                        isDone
                          ? 'border-success bg-success-soft text-success shadow-2xs'
                          : 'border-line text-muted hover:border-accent hover:text-accent'
                      }`}
                      title={isDone ? 'تمت القراءة' : 'اضغط للتأشير'}
                    >
                      <Check className={`h-4 w-4 ${isDone ? 'stroke-[2.5]' : ''}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Decorative Divider */}
        <OrnateDivider />

        {/* SECTION 3: Repeated Adhkar with Enhanced Counters */}
        <section aria-label="أذكار مقترنة بعدد المرات">
          <div className="rounded-2xl border border-line bg-canvas/40 p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between border-b border-line/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-black">
                  ∞
                </span>
                <h2 className="font-display text-base sm:text-lg font-bold text-fg">
                  أذكار مقترنة بعدد المرات والتكرار
                </h2>
              </div>
              <span className="text-xs font-bold text-accent hidden sm:inline">
                انقر على الزر لاحتساب التكرار
              </span>
            </div>

            <ul className="divide-y divide-line/60">
              {data.repeatedSection.map((item) => {
                const currentCount = counts[item.id] || 0;
                const target = getTarget(item.id, item.count);
                const isFinished = currentCount >= target;

                return (
                  <li
                    key={item.id}
                    onClick={() => handleIncrement(item.id, item.count)}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1 cursor-pointer transition hover:bg-surface/40 rounded-xl px-1 sm:px-2"
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3 flex-1">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-fill group-hover:scale-125 transition" />
                      <div className="flex-1">
                        <p
                          className={`font-sans text-fg transition ${textSizeClass} ${
                            isFinished ? 'opacity-65' : ''
                          }`}
                        >
                          {item.text}
                        </p>
                        {(item.note || item.source) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            {item.note && (
                              <span className="font-medium text-accent">
                                {item.note}
                              </span>
                            )}
                            {item.source && <span>({item.source})</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Enhanced Dhikr Counter Component */}
                    <div className="flex items-center justify-end sm:justify-start gap-2 pt-1 sm:pt-0 shrink-0">
                      <DhikrCounter
                        id={item.id}
                        count={currentCount}
                        maxCount={item.count}
                        countLabel={item.countLabel}
                        countOptions={item.countOptions}
                        selectedTarget={target}
                        onSelectTarget={(t) => handleSelectTarget(item.id, t)}
                        onIncrement={() => handleIncrement(item.id, item.count)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Quick Action to Complete Entire Ward & Link Tasks */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-line bg-canvas/60 p-4 sm:p-5">
          <div className="text-center sm:text-start">
            <h3 className="font-display text-sm font-bold text-fg">
              أتممت قراءة {data.title}؟
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {matchingTask
                ? matchingTask.done
                  ? 'تم تسجيل هذه المهمة في حسابك اليوم بنجاح.'
                  : `اضغط لتأكيد الإتمام وتسجيل +${matchingTask.points} نقطة في حسابك.`
                : 'يمكنك تأشير جميع الأذكار دفعة واحدة.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCompleteAll}
            disabled={isEntireWardCompleted && (!matchingTask || matchingTask.done)}
            className={`btn-primary !min-h-10 !py-2 !px-5 text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm ${
              isEntireWardCompleted && (!matchingTask || matchingTask.done)
                ? 'opacity-60 cursor-default'
                : ''
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isEntireWardCompleted ? 'تم إتمام الورد كاملاً' : 'تأكيد إتمام الورد كاملاً'}
            </span>
          </button>
        </div>

        {/* Footer Note of the Card */}
        <footer className="mt-6 border-t border-line/80 pt-4 text-center">
          <p className="font-display text-xs font-semibold text-muted">
            «أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ» — موقع رجال الأمة
          </p>
        </footer>
      </article>
    </div>
  );
}
