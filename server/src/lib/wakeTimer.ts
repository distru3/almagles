/**
 * A background job that sleeps until it next has work instead of polling.
 *
 * Neon (the production database) switches its compute off after five minutes
 * without a query and bills only while it's on. Reminder checks every 30s kept
 * it on around the clock and used up the month's allowance. Now each run
 * returns when it is next needed (the next reminder due) and nothing touches
 * the database in between; an edit that may move that moment calls `poke()`.
 */

/** Longest sleep, as a safety net only: every edit that changes a due time pokes the job. */
export const MAX_SLEEP_MS = 24 * 60 * 60 * 1000;
/** After an edit, wait this long so a burst of edits (a week being built) costs one run. */
export const POKE_DELAY_MS = 5_000;
/** After a failed run (the database unreachable), try again this much later. */
export const RETRY_MS = 5 * 60 * 1000;
/** Wake this long after the due moment, so the job never finds it a hair early. */
const LATE_MS = 1_000;

export interface WakeTimer {
  /** Runs at once, then keeps itself scheduled (from index.ts only, so tests drive the jobs themselves). */
  start(): void;
  /** Something changed: run again shortly, never later than already planned. No-op until started. */
  poke(): void;
}

export function wakeTimer(name: string, run: (now: Date) => Promise<Date | null>): WakeTimer {
  let started = false;
  let running = false;
  let again = false;
  let timer: NodeJS.Timeout | null = null;
  let wakeAt = Infinity;

  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    const delay = Math.min(Math.max(ms, 0), MAX_SLEEP_MS);
    wakeAt = Date.now() + delay;
    timer = setTimeout(() => void fire(), delay);
    timer.unref?.();
  };

  const fire = async () => {
    timer = null;
    wakeAt = Infinity;
    if (running) {
      again = true;
      return;
    }
    running = true;
    let next: Date | null = null;
    let failed = false;
    try {
      next = await run(new Date());
    } catch (err) {
      failed = true;
      console.error(`[notifications] ${name}`, err);
    }
    running = false;
    if (again) {
      again = false;
      return arm(0);
    }
    // At least LATE_MS, so a job naming a moment already past can't spin.
    arm(failed ? RETRY_MS : next ? Math.max(next.getTime() - Date.now(), 0) + LATE_MS : MAX_SLEEP_MS);
  };

  return {
    start() {
      if (started) return;
      started = true;
      void fire();
    },
    poke() {
      if (!started) return;
      if (running) {
        again = true;
        return;
      }
      if (wakeAt > Date.now() + POKE_DELAY_MS) arm(POKE_DELAY_MS);
    },
  };
}
