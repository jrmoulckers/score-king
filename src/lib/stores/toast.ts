import { writable } from 'svelte/store';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastState {
  message: string;
  action?: ToastAction;
}

export const toast = writable<ToastState | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, ms = 2200): void {
  toast.set({ message });
  clearTimeout(timer);
  timer = setTimeout(() => toast.set(null), ms);
}

/** A toast with a single action (e.g. Undo). Stays longer so keyboard and
 * screen-reader users have time to Tab to and trigger the action before it
 * auto-dismisses. */
export function showActionToast(
  message: string,
  label: string,
  run: () => void,
  ms = 9000,
): void {
  toast.set({
    message,
    action: {
      label,
      run: () => {
        clearTimeout(timer);
        toast.set(null);
        run();
      },
    },
  });
  clearTimeout(timer);
  timer = setTimeout(() => toast.set(null), ms);
}

export function dismissToast(): void {
  clearTimeout(timer);
  toast.set(null);
}
