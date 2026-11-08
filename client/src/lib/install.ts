import { useEffect, useState } from 'react';

/** Chrome/Edge/Android's "install this app" prompt, which can only be shown from a click. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Registered at import time: the browser fires this once, early, and doesn't repeat it.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** `install` is null when the browser has nothing to offer (already installed, iOS, Firefox…). */
export function useInstallPrompt(): { install: (() => Promise<void>) | null } {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!deferred) return { install: null };
  const event = deferred;
  return {
    install: async () => {
      await event.prompt();
      await event.userChoice;
      deferred = null;
      notify();
    },
  };
}
