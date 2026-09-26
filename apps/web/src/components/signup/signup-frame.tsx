'use client'

import { LocaleSwitcher } from '@guestnote/ui/locale-switcher'
import { StepIndicator } from '@guestnote/ui/step-indicator'
import { type ReactNode, useTransition } from 'react'
import type { Locale } from '../../lib/locales.ts'
import { setLocale } from '../auth/actions.ts'
import { Stage, type StageContent } from '../auth/stage.tsx'
import { Wordmark } from '../brand/wordmark.tsx'

type Props = {
  readonly steps: readonly string[]
  readonly current: number
  readonly language: string
  readonly locale: Locale
  readonly locales: readonly Locale[]
  readonly stage: StageContent
  readonly footer?: ReactNode
  readonly children: ReactNode
}

/**
 * The sign-in surface's shell for sign-up's signed-in steps: the same `.signin` grid from
 * `descent.css`, the same header, the same 21rem column and the stage beside it. Account and
 * Verify are `AuthFlow` itself, so a planner moving from "Verify" to "Studio" sees the column
 * stay where it was and only its content change.
 *
 * Its own component rather than a mode of `AuthFlow`: everything that makes that component
 * large is the three-rung ceremony, and none of it applies once there is a session.
 *
 * The stage stands at its deepest stop (`rung 2`) throughout: the visitor has already
 * descended out of the public web, and the steps after that are inside.
 */
export function SignupFrame({
  steps,
  current,
  language,
  locale,
  locales,
  stage,
  footer,
  children,
}: Props) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="signin">
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-8 lg:pt-6">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Wordmark className="h-5 w-auto" />
            <span>Guestnote</span>
          </div>
          <LocaleSwitcher
            locales={locales}
            current={locale}
            label={language}
            disabled={pending}
            onSelect={(next) => startTransition(() => setLocale(next))}
          />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pt-4 pb-8 lg:px-8">
          <div className="w-full max-w-[21rem]">
            <StepIndicator className="mb-6" steps={steps} current={current} />
            {children}
          </div>
        </div>

        {footer && (
          <p className="text-muted-foreground shrink-0 px-5 pb-6 text-xs leading-relaxed lg:px-8">
            {footer}
          </p>
        )}
      </div>

      <Stage rung={2} content={stage} />
    </div>
  )
}

/** A text-weight link beside the main action ("Skip for now"), `LinkButton`'s look on an `<a>`. */
export function StepLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-xs text-[color:var(--gn-muted,var(--muted-foreground))] underline underline-offset-[3px] transition-colors hover:text-[color:var(--gn-fg,var(--foreground))]"
    >
      {children}
    </a>
  )
}
