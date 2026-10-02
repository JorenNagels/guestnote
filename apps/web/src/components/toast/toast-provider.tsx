'use client'

import { Toast, type ToastItem } from '@guestnote/ui/toast'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

/**
 * What an undo answered. `restored` and `gone` have generic words (the provider's labels);
 * anything more specific -- "this vendor is on the wedding again already" -- is the caller's own
 * sentence, because only the caller knows its error vocabulary.
 */
export type UndoResult = 'restored' | 'gone' | { readonly message: string }

export type ShowToast = {
  readonly message: string
  /**
   * Puts back what was just removed. A throw is "the request did not arrive", and keeps the
   * Undo button for another go; a returned refusal is final and removes it.
   */
  readonly undo?: () => Promise<UndoResult>
}

export type ToastLabels = {
  undo: string
  dismiss: string
  restored: string
  gone: string
  failed: string
}

type Toaster = { show(toast: ShowToast): void }

/**
 * Outside a provider, `show` does nothing. Only `(app)/layout.tsx` mounts one, and it returns the
 * page bare for a planner with no org -- who has nothing to delete. Rejected: throwing, which
 * would turn a missing provider into a crash of the screen the planner was deleting on, after the
 * delete had already happened.
 */
const ToastContext = createContext<Toaster>({ show: () => {} })

export function useToast(): Toaster {
  return useContext(ToastContext)
}

type Current = {
  readonly id: number
  readonly message: string
  readonly undo: (() => Promise<UndoResult>) | undefined
  readonly busy: boolean
}

/**
 * Spec 0009 C4: "deleted, Undo" instead of "are you sure?". Mounted once, around the pages in
 * `(app)/layout.tsx`, which is what lets a toast outlive the thing that raised it: the line sheet
 * that deleted a budget line closes in the same moment, and the revalidation that follows
 * re-renders the page but not the layout, whose state React keeps.
 *
 * One toast at a time: a second delete replaces the first, and with it the first's Undo. That is
 * the trade the spec made -- a stack of eight-second toasts is a second inbox at the bottom of
 * the screen. An undo that is still in flight when it is replaced finishes on the server and
 * says nothing (the newer toast is not overwritten with an older answer).
 *
 * Here and not in `packages/ui`: what Undo means is a Server Function call, and the generic
 * words come from the app's catalogue. The card itself is `@guestnote/ui/toast`.
 */
export function ToastProvider({ labels, children }: { labels: ToastLabels; children: ReactNode }) {
  const [current, setCurrent] = useState<Current | null>(null)
  const seq = useRef(0)

  const show = useCallback((toast: ShowToast) => {
    seq.current += 1
    setCurrent({ id: seq.current, message: toast.message, undo: toast.undo, busy: false })
  }, [])
  // Stable, so a toast arriving does not re-render every screen that can raise one.
  const toaster = useMemo(() => ({ show }), [show])

  const runUndo = async (shown: Current) => {
    const undo = shown.undo
    if (!undo) return
    setCurrent((c) => (c?.id === shown.id ? { ...c, busy: true } : c))
    let next: { message: string; undo: (() => Promise<UndoResult>) | undefined }
    try {
      const result = await undo()
      next = {
        message:
          result === 'restored'
            ? labels.restored
            : result === 'gone'
              ? labels.gone
              : result.message,
        undo: undefined,
      }
    } catch {
      next = { message: labels.failed, undo }
    }
    // A new id restarts the clock, so the answer gets its own eight seconds.
    seq.current += 1
    const id = seq.current
    setCurrent((c) => (c?.id === shown.id ? { id, ...next, busy: false } : c))
  }

  const item: ToastItem | null = current && {
    id: current.id,
    message: current.message,
    ...(current.undo && {
      action: { label: labels.undo, busy: current.busy, onClick: () => void runUndo(current) },
    }),
  }

  return (
    <ToastContext.Provider value={toaster}>
      {children}
      <Toast toast={item} dismissLabel={labels.dismiss} onDismiss={() => setCurrent(null)} />
    </ToastContext.Provider>
  )
}
