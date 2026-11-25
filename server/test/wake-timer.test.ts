import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SLEEP_MS, POKE_DELAY_MS, RETRY_MS, wakeTimer } from '../src/lib/wakeTimer.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('wakeTimer', () => {
  it('runs once at start, then sleeps until the moment the job names', async () => {
    const run = vi.fn(async () => new Date('2026-12-01T01:00:00Z'));
    wakeTimer('test', run).start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000 + 1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('with nothing to wait for, sleeps the longest and no more', async () => {
    const run = vi.fn(async () => null);
    wakeTimer('test', run).start();
    await vi.advanceTimersByTimeAsync(MAX_SLEEP_MS - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a poke brings the run forward, but never puts off one already due sooner', async () => {
    let next: Date | null = null;
    const run = vi.fn(async () => {
      const at = next;
      next = null;
      return at;
    });
    const job = wakeTimer('test', run);
    job.start();
    await vi.advanceTimersByTimeAsync(0);

    job.poke();
    job.poke();
    await vi.advanceTimersByTimeAsync(POKE_DELAY_MS);
    expect(run).toHaveBeenCalledTimes(2);

    // The run names a moment 1s ahead; a poke now must not push it back to 5s.
    next = new Date(Date.now() + 1_000);
    job.poke();
    await vi.advanceTimersByTimeAsync(POKE_DELAY_MS);
    expect(run).toHaveBeenCalledTimes(3);
    job.poke();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('does nothing when poked before it is started (as in tests and scripts)', async () => {
    const run = vi.fn(async () => null);
    wakeTimer('test', run).poke();
    await vi.advanceTimersByTimeAsync(POKE_DELAY_MS * 2);
    expect(run).not.toHaveBeenCalled();
  });

  it('tries again a few minutes after a failed run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn(async () => {
      throw new Error('database unreachable');
    });
    wakeTimer('test', run).start();
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(run).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
