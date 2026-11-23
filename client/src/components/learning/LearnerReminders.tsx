import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Check, ChevronDown, History } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Learner } from '../../lib/types';
import { dateTime, dateTimeTitle } from '../../lib/dates';
import { arNumber, isRestDay, lessonsLabel } from '../../lib/learning';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../Avatar';
import Spinner from '../Spinner';

const STATE: Record<Learner['state'], { label: string; className: string }> = {
  done: { label: 'أتمّ درس اليوم', className: 'bg-success-soft text-success' },
  partial: { label: 'أنجز بعضه', className: 'bg-accent-soft text-accent' },
  not_started: { label: 'لم يبدأ بعد', className: 'bg-surface-2 text-fg-2' },
  no_lesson: { label: 'لا درس اليوم', className: 'bg-surface-2 text-muted' },
};

/** «أُرسل التذكير إلى ٣ من الإخوة». */
function sentLine(sent: number, skipped: number): string {
  const head = sent === 0 ? 'لم يُرسل تذكير جديد' : sent === 1 ? 'أُرسل التذكير إلى أخ واحد' : `أُرسل التذكير إلى ${arNumber.format(sent)} من الإخوة`;
  return skipped ? `${head} — و${arNumber.format(skipped)} ذُكّروا اليوم من قبل` : head;
}

/**
 * «تذكير الإخوة», for supervisors: who on the journey has finished today's
 * lesson, who is part way, who hasn't begun — and a gentle reminder, to one
 * brother or to all who haven't finished, with a word of the supervisor's
 * own. Nobody is reminded twice in a day; the server holds to that.
 */
export default function LearnerReminders({ today }: { today: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rest = isRestDay(today);

  const load = useCallback(async () => {
    try {
      const res = await api<{ learners: Learner[] }>(`/learning/manage/learners?date=${today}`);
      setLearners(res.learners);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل الإخوة');
    }
  }, [today]);

  useEffect(() => {
    if (open && !learners) void load();
  }, [open, learners, load]);

  const remind = async (userIds?: string[]) => {
    setBusy(userIds?.[0] ?? 'all');
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ sent: number; skipped: number }>('/learning/manage/remind', {
        method: 'POST',
        body: { date: today, ...(userIds && { userIds }), message: message.trim() || null },
      });
      setNotice(sentLine(res.sent, res.skipped));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال التذكير');
    } finally {
      setBusy(null);
    }
  };

  const waiting = (learners ?? []).filter((l) => (l.state === 'not_started' || l.state === 'partial') && !l.remindedAt && l.id !== user?.id);
  const count = (s: Learner['state']) => (learners ?? []).filter((l) => l.state === s).length;

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-start sm:px-5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
          <BellRing className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] text-fg">تذكير الإخوة</span>
          <span className="block text-xs text-muted">من أتمّ درس اليوم ومن لم يبدأ — وذكّر من تأخّر بلطف</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t border-line px-4 py-4 sm:px-5">
          {rest ? (
            <p className="text-sm text-muted">اليوم يوم الاستجمام — لا درس فيه يُذكَّر به.</p>
          ) : !learners ? (
            error ? <p className="text-sm text-danger">{error}</p> : <Spinner />
          ) : learners.length === 0 ? (
            <p className="text-sm text-muted">لم ينضم أحد إلى الرحلة بعد.</p>
          ) : (
            <>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-2">
                <span>أتمّه {arNumber.format(count('done'))}</span>
                <span>أنجز بعضه {arNumber.format(count('partial'))}</span>
                <span>لم يبدأ {arNumber.format(count('not_started'))}</span>
              </p>

              <label htmlFor="remind-message" className="label mt-3">
                كلمة منك (اختيارية)
              </label>
              <input
                id="remind-message"
                className="input"
                value={message}
                maxLength={300}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="مثلًا: درس اليوم قصير ونافع، لا يفوتنّك"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className="btn-primary !min-h-10 !text-sm" disabled={busy !== null || waiting.length === 0} onClick={() => void remind()}>
                  <BellRing className="h-4 w-4" aria-hidden="true" />
                  ذكّر من لم يُتمّ درس اليوم{waiting.length ? ` (${arNumber.format(waiting.length)})` : ''}
                </button>
                {waiting.length === 0 && <span className="text-xs text-muted">لا أحد بانتظار تذكير الآن.</span>}
              </div>

              {notice && (
                <p role="status" className="mt-3 rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {error}
                </p>
              )}

              <ul className="mt-4 divide-y divide-line border-t border-line">
                {learners.map((l) => {
                  const state = STATE[l.state];
                  const self = l.id === user?.id;
                  return (
                    <li key={l.id} className="flex items-center gap-3 py-3">
                      <Link to={`/u/${l.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
                        <Avatar name={l.name} src={l.avatarUrl} size="sm" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Link to={`/u/${l.id}`} className="font-display text-fg hover:text-accent">
                            {self ? 'أنت' : l.name}
                          </Link>
                          <span className={`rounded-full px-2 text-[11px] leading-5 ${state.className}`}>{state.label}</span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                          {l.behind > 0 && (
                            <span className="inline-flex items-center gap-1 text-warn">
                              <History className="h-3 w-3" aria-hidden="true" />
                              له {lessonsLabel(l.behind)} للتدارك
                            </span>
                          )}
                          {l.lastActiveAt ? (
                            <span title={dateTimeTitle(l.lastActiveAt)}>آخر تسجيل: {dateTime(l.lastActiveAt)}</span>
                          ) : (
                            <span>لم يسجّل درسًا بعد</span>
                          )}
                        </p>
                      </div>
                      {!self &&
                        (l.remindedAt ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted" title={dateTimeTitle(l.remindedAt)}>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            ذُكّر اليوم
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void remind([l.id])}
                            className="min-h-10 shrink-0 rounded-full border border-line-strong px-4 font-display text-sm text-fg-2 transition hover:border-accent hover:text-accent disabled:opacity-50"
                          >
                            ذكّره
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
