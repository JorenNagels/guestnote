'use client'

import { Button } from '@guestnote/ui/button'

/** The day, on paper, for the venue with no signal (spec 0008). */
export function PrintButton({ label }: { label: string }) {
  return (
    <span className="print:hidden">
      <Button type="button" variant="secondary" className="w-auto!" onClick={() => window.print()}>
        {label}
      </Button>
    </span>
  )
}
