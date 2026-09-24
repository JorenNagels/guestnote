'use client'

import { cx } from '@guestnote/ui/cx'
import { useTransition } from 'react'
import { switchOrg } from '../../app/pro/(app)/actions.ts'
import { CheckIcon, ChevronIcon } from './icons.tsx'
import { Menu, MenuLabel, MenuRow } from './menu.tsx'
import { Monogram } from './monogram.tsx'

export type OrgOption = { id: string; name: string; slug: string }

/**
 * The organisation at the top of the sidebar. **A menu only when there is somewhere to go.**
 *
 * With one organisation this renders a plain label with no disclosure affordance at all --
 * not a disabled control, not a chevron that does nothing. Nearly every planner is staff at
 * exactly one org, so for nearly everyone a switcher would be a control that never does
 * anything, and `docs/specs/0001` records that as the decision rather than an omission.
 *
 * ## Guestnote's own mark is not here
 *
 * The org owns the top of the sidebar and the account owns the foot; the product's wordmark
 * appears on login, on marketing, and -- since 2026-09-24 -- once as a "powered by" line in
 * the page footer, below the org's own name (`shell.tsx`). Never up here: this is sold to
 * planners who brand their own service, so putting our mark above theirs, in their
 * workspace, is the wrong hierarchy. The spec names the two rejected layouts.
 */
export function OrgHead({
  current,
  orgs,
  collapsed,
  labels,
}: {
  current: OrgOption
  orgs: OrgOption[]
  collapsed: boolean
  labels: { switch: string; current: string }
}) {
  const [pending, startTransition] = useTransition()

  // One org is not "a menu with one item". It is not a menu.
  if (orgs.length < 2) {
    return (
      <div
        className={cx('flex h-11 items-center gap-2.5', collapsed ? 'justify-center' : 'px-2.5')}
      >
        <Monogram name={current.name} />
        {/* On the rail the monogram is all that is left, and a monogram is decoration. So
            the name becomes visually-hidden TEXT rather than an `aria-label` on the wrapper:
            a label on a div with no role is ignored by assistive tech and flagged by lint,
            both for the same reason. Real text in the DOM is announced, is findable by
            in-page search, and survives the CSS being wrong. */}
        <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate text-sm font-semibold'}>
          {collapsed ? `${labels.current}: ${current.name}` : current.name}
        </span>
      </div>
    )
  }

  return (
    <Menu
      side="bottom"
      trigger={({ ref, ...aria }) => (
        <button
          type="button"
          ref={ref}
          {...aria}
          aria-label={collapsed ? labels.switch : undefined}
          title={collapsed ? current.name : undefined}
          disabled={pending}
          className={cx(
            'flex h-11 w-full items-center gap-2.5 rounded-[var(--radius)] transition-colors',
            'enabled:cursor-pointer disabled:opacity-60',
            'hover:bg-muted/60 outline-none focus-visible:outline-ring focus-visible:outline-2',
            collapsed ? 'justify-center' : 'px-2.5',
          )}
        >
          <Monogram name={current.name} />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                {current.name}
              </span>
              <ChevronIcon className="size-[1em] shrink-0 opacity-60" />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{labels.switch}</MenuLabel>
          {orgs.map((org, i) => (
            <MenuRow
              key={org.id}
              first={i === 0}
              selected={org.id === current.id}
              onClick={() => {
                close()
                // Switching the current org is a no-op write and a full shell re-render for
                // nothing, so it is skipped rather than sent.
                if (org.id === current.id) return
                startTransition(() => {
                  void switchOrg(org.id)
                })
              }}
            >
              <Monogram name={org.name} className="size-5 text-[0.5625rem]" />
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              {org.id === current.id ? <CheckIcon className="size-[0.9em] shrink-0" /> : null}
            </MenuRow>
          ))}
        </>
      )}
    </Menu>
  )
}
