import type { ToastLabels } from './toast-provider.tsx'

/** English toast words for the component tests, so an assertion reads as the sentence it checks. */
export const TOAST_LABELS: ToastLabels = {
  undo: 'Undo',
  dismiss: 'Dismiss',
  restored: 'Restored.',
  gone: 'This can no longer be restored.',
  failed: 'Undo did not work. Try again.',
}
