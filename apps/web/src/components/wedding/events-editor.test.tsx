import type { WeddingEvent } from '@guestnote/db'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import nl from '../../../messages/app/weddingPages.nl.json'
import { EventsEditor } from './events-editor.tsx'
import { eventsLabels } from './labels.ts'

/**
 * The anchored-task note beside Remove (spec 0004). Remove has no confirm step, so this line is
 * the only place a planner learns that removing an event sends tasks back to the main day.
 * Labels come through the real `eventsLabels` over the real NL catalogue.
 */
const lookup = (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], nl)
const t = Object.assign((key: string) => String(lookup(key)), { raw: lookup })

const event = (id: string, label: string): WeddingEvent => ({
  id,
  label,
  startsOn: '2027-07-16',
  startsAt: null,
  venue: null,
  position: 0,
})

function view(anchored: Record<string, number>) {
  render(
    <EventsEditor
      action={async (prev) => prev}
      events={[event('e1', 'Burgerlijk'), event('e2', 'Brunch'), event('e3', 'Receptie')]}
      anchored={anchored}
      labels={eventsLabels(t)}
    />,
  )
}

describe('EventsEditor anchored note', () => {
  it('says how many tasks fall back, singular and plural, and nothing for an event with none', () => {
    view({ e1: 1, e2: 3 })
    expect(screen.getByText(/^1 taak telt vanaf dit moment/)).toBeTruthy()
    expect(screen.getByText(/^3 taken tellen vanaf dit moment/)).toBeTruthy()
    expect(screen.getAllByText(/vanaf dit moment/)).toHaveLength(2)
  })
})
