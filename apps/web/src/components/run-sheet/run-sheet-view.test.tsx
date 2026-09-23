import type { RunSheetItem, WeddingEvent } from '@guestnote/db'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RunSheetView } from './run-sheet-view.tsx'
import { renderWithCopy } from './test-support.tsx'

const saveRunSheetItem = vi.fn()
const removeRunSheetItem = vi.fn()
const shiftRunSheetItem = vi.fn()

vi.mock('../../app/pro/(app)/weddings/[id]/run-sheet/actions.ts', () => ({
  saveRunSheetItem: (...a: unknown[]) => saveRunSheetItem(...a),
  removeRunSheetItem: (...a: unknown[]) => removeRunSheetItem(...a),
  shiftRunSheetItem: (...a: unknown[]) => shiftRunSheetItem(...a),
}))

const W = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

const event = (over: Partial<WeddingEvent> & Pick<WeddingEvent, 'id' | 'label'>): WeddingEvent => ({
  startsOn: '2027-06-12',
  startsAt: null,
  venue: null,
  position: 0,
  ...over,
})

const item = (over: Partial<RunSheetItem> & Pick<RunSheetItem, 'id' | 'title'>): RunSheetItem => ({
  eventId: 'e1',
  startsAt: '09:00',
  durationMin: 30,
  place: null,
  weddingVendorId: null,
  vendorName: null,
  position: 0,
  ...over,
})

function view(over: {
  events?: WeddingEvent[]
  selectedEventId?: string | null
  items?: RunSheetItem[]
}) {
  const events = over.events ?? [event({ id: 'e1', label: 'Ceremony' })]
  return renderWithCopy(
    <RunSheetView
      weddingId={W}
      coupleName="Emma and Lucas"
      locale="en"
      events={events}
      selectedEventId={over.selectedEventId ?? events[0]?.id ?? null}
      items={over.items ?? []}
      vendors={[]}
    />,
  )
}

beforeEach(() => {
  saveRunSheetItem.mockReset().mockResolvedValue({ ok: true })
  removeRunSheetItem.mockReset().mockResolvedValue({ ok: true })
  shiftRunSheetItem.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('RunSheetView', () => {
  it('no events: one card, a link to settings, no tabs and no table', () => {
    view({ events: [] })
    expect(screen.getByRole('heading', { name: 'No day to make a run sheet for yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to settings' })).toHaveAttribute(
      'href',
      `/weddings/${W}/settings`,
    )
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('one event, no items: the empty card, no tab strip for a single event', () => {
    view({ items: [] })
    expect(screen.getByRole('heading', { name: 'Nothing on this run sheet yet' })).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add the first item' }))
    expect(screen.getByRole('dialog', { name: 'New item' })).toBeTruthy()
  })

  it('more than one event: a tab strip of links, one per event', () => {
    view({
      events: [
        event({ id: 'e1', label: 'Ceremony' }),
        event({ id: 'e2', label: 'Reception', startsOn: '2027-06-13' }),
      ],
      selectedEventId: 'e2',
    })
    const nav = screen.getByRole('navigation', { name: 'Days of the wedding' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Ceremony'),
      expect.stringContaining('Reception'),
    ])
    expect(within(nav).getByRole('link', { name: /Reception/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /Ceremony/ })).not.toHaveAttribute('aria-current')
  })

  it('lists items in order, with a computed end time and a summary line', () => {
    view({
      items: [
        item({ id: 'i1', title: 'Arrival', startsAt: '14:00', durationMin: 30 }),
        item({ id: 'i2', title: 'Vows', startsAt: '14:30', durationMin: 20 }),
      ],
    })
    expect(screen.getByText('2 items, 14:00 to 14:50')).toBeTruthy()
    expect(screen.getAllByText('Arrival').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vows').length).toBeGreaterThan(0)
    // Neither item crosses midnight, so no day mark should show anywhere.
    expect(screen.queryByText(/^\+\d/)).toBeNull()
  })

  it('warns about an overlap, always, and about a gap only from 30 minutes', () => {
    view({
      items: [
        item({ id: 'i1', title: 'Long thing', startsAt: '14:00', durationMin: 60 }),
        // Starts before "Long thing" (14:00-15:00) has ended: an overlap, however small.
        item({ id: 'i2', title: 'Overlapper', startsAt: '14:50', durationMin: 10 }),
        // 40 minutes free after 15:00: a gap warning.
        item({ id: 'i3', title: 'After a gap', startsAt: '15:40', durationMin: 10 }),
        // Only 10 minutes free after 15:50: no warning at all.
        item({ id: 'i4', title: 'Right after', startsAt: '16:00', durationMin: 10 }),
      ],
    })
    // Scoped to the desktop table: the phone list renders the same rows again below it,
    // so an unscoped query would double-count every warning.
    const table = screen.getByRole('table')
    expect(within(table).getAllByText(/Overlaps the item above/).length).toBe(1)
    expect(within(table).getAllByText(/free/).length).toBe(1)
  })

  it('marks a start after midnight with a visible "+1" and a spoken "the next day"', () => {
    view({
      items: [
        item({ id: 'i1', title: 'Dance', startsAt: '23:00', durationMin: 60 }),
        // Earlier than the item before it: read as after midnight.
        item({ id: 'i2', title: 'Last song', startsAt: '00:30', durationMin: 10 }),
      ],
    })
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('(the next day)').length).toBeGreaterThan(0)
  })

  it('a row with no vendor reads "Planner"', () => {
    view({ items: [item({ id: 'i1', title: 'Toast', weddingVendorId: null, vendorName: null })] })
    expect(screen.getAllByText('Planner').length).toBeGreaterThan(0)
  })
})
