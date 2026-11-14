import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Unsaved edits in the schedule editors. Nothing there saves by itself: each
 * session row or note with changes registers here, so the page can offer
 * «حفظ الكل», count what is pending, and warn before those edits are lost.
 */
interface Entry {
  /** Saves this one; resolves false when it failed or couldn't be saved yet. */
  save: () => Promise<boolean>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Registers (entry) or clears (null) the unsaved edits under `key`. */
export function markDirty(key: string, entry: Entry | null) {
  const had = entries.has(key);
  if (entry) entries.set(key, entry);
  else entries.delete(key);
  if (had !== Boolean(entry)) emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** How many rows / notes have unsaved changes. */
export function useUnsavedCount() {
  return useSyncExternalStore(subscribe, () => entries.size);
}

export const hasUnsaved = () => entries.size > 0;

/** Saves everything pending, one at a time. Resolves true when all of it saved. */
export async function saveAll(): Promise<boolean> {
  let ok = true;
  for (const entry of [...entries.values()]) {
    if (!(await entry.save())) ok = false;
  }
  return ok;
}

const LEAVE_MESSAGE = 'لديك تغييرات غير محفوظة في الجدول. هل تريد تجاهلها والمتابعة؟';

/** Before an action that would drop unsaved edits: true when there are none or the user agrees to lose them. */
export function confirmDiscard(): boolean {
  return !hasUnsaved() || window.confirm(LEAVE_MESSAGE);
}

/**
 * While mounted, warns before unsaved edits are lost by closing or reloading the
 * page, following an in-app link, or pressing Ctrl/Cmd+S (which saves instead).
 */
export function useUnsavedGuard(onSaveShortcut: () => void) {
  const shortcut = useRef(onSaveShortcut);
  shortcut.current = onSaveShortcut;
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) e.preventDefault();
    };
    // Capture phase on document runs before React's own handlers, so a cancelled
    // click never reaches <Link>.
    const onClick = (e: MouseEvent) => {
      if (!hasUnsaved() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        shortcut.current();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
