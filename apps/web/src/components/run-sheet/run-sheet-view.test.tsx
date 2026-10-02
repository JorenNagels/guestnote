import type { RunSheetItem, RunSheetOwner, WeddingEvent } from '@guestnote/db'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RunSheetView } from './run-sheet-view.tsx'
import { renderWithCopy } from './test-support.tsx'

const saveRunSheetItem = vi.fn()
const removeRunSheetItem = vi.fn()
const shiftRunSheetItem = vi.fn()
const shiftRunSheetFrom = vi.fn()

vi.mock('../../app/pro/(app)/weddings/[id]/run-sheet/actions.ts', () => ({
  saveRunSheetItem: (...a: unknown[]) => saveRunSheetItem(...a),
  removeRunSheetItem: (...a: unknown[]) => removeRunSheetItem(...a),
  shiftRunSheetItem: (...a: unknown[]) => shiftRunSheetItem(...a),
  shiftRunSheetFrom: (...a: unknown[]) => shiftRunSheetFrom(...a),
}))

const saveEventAction = vi.fn()
const push = vi.fn()
vi.mock('../../app/pro/(app)/weddings/[id]/settings/actions.ts', () => ({
  saveEventAction: (...a: unknown[]) => saveEventAction(...a),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

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
  vendorPhone: null,
  ownerUserId: null,
  ownerName: null,
  position: 0,
  ...over,
})

function view(over: {
  events?: WeddingEvent[]
  selectedEventId?: string | null
  items?: RunSheetItem[]
  owners?: RunSheetOwner[]
  viewerId?: string | null
  color?: string | null
  mainDay?: { label: string; date: string | null }
  studioName?: string
}) {
  const events = over.events ?? [event({ id: 'e1', label: 'Ceremony' })]
  return renderWithCopy(
    <RunSheetView
      weddingId={W}
      locale="en"
      events={events}
      selectedEventId={over.selectedEventId ?? events[0]?.id ?? null}
      items={over.items ?? []}
      vendors={[]}
      owners={over.owners ?? []}
      viewerId={over.viewerId ?? null}
      color={over.color ?? null}
      mainDay={over.mainDay ?? { label: 'Trouwdag', date: null }}
      coupleName="Els & Jan"
      studioName={over.studioName ?? 'Studio Lore'}
    />,
  )
}

beforeEach(() => {
  saveRunSheetItem.mockReset().mockResolvedValue({ ok: true })
  removeRunSheetItem.mockReset().mockResolvedValue({ ok: true })
  shiftRunSheetItem.mockReset().mockResolvedValue({ ok: true })
  shiftRunSheetFrom.mockReset().mockResolvedValue({ ok: true })
  saveEventAction.mockReset().mockResolvedValue({ notice: 'saved', eventId: 'e-new' })
  push.mockReset()
})
afterEach(cleanup)

describe('RunSheetView', () => {
  it('no events and no date: the add-a-day form in the card, no tabs and no table', () => {
    view({ events: [], mainDay: { label: 'Trouwdag', date: null } })
    expect(screen.getByRole('heading', { name: 'No day to make a run sheet for yet' })).toBeTruthy()
    const form = screen.getByRole('form', { name: 'Add a day' })
    expect(within(form).getByLabelText('Name')).toBeTruthy()
    expect(within(form).getByLabelText('Date')).toBeTruthy()
    expect(within(form).getByLabelText('Time (optional)')).toBeTruthy()
    // Nothing to go back to: the form IS the empty state.
    expect(within(form).queryByRole('button', { name: 'Cancel' })).toBeNull()
    // No date, so no one-click start: it would have nothing to put the day on.
    expect(screen.queryByRole('button', { name: /Start the run sheet/ })).toBeNull()
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

  /**
   * Spec 0009 C4: a run-sheet item is a HARD delete (no `deleted_at`), so unlike a budget line or
   * a file it keeps its "are you sure" -- there is nothing an Undo could put back.
   */
  it('still asks before deleting an item, which cannot be undone', async () => {
    view({ items: [item({ id: 'i1', title: 'Vows', startsAt: '14:30', durationMin: 20 })] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Vows' })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(removeRunSheetItem).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this item? This cannot be undone.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(removeRunSheetItem).toHaveBeenCalled())
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

/**
 * Spec 0004: a row owned by the viewer is tinted, and the owner is named beside the vendor.
 * The tint is asserted through the custom property the row carries, because jsdom does not
 * resolve `color-mix` or Tailwind's arbitrary-value class into a computed background.
 */
describe('run-sheet owners', () => {
  const ME = 'u-me'
  const rows = () => [
    item({ id: 'i1', title: 'Mine', ownerUserId: ME, ownerName: 'Katrien' }),
    item({ id: 'i2', title: 'Theirs', startsAt: '10:00', ownerUserId: 'u-2', ownerName: 'Lore' }),
    item({ id: 'i3', title: 'Nobody', startsAt: '11:00' }),
  ]
  const tableRow = (title: string) =>
    within(screen.getByRole('table')).getByText(title).closest('tr') as HTMLElement

  it("tints only the viewer's own rows, in the wedding colour mixed into the card", () => {
    view({ items: rows(), viewerId: ME, color: '#206560' })
    expect(tableRow('Mine').style.getPropertyValue('--row-tint')).toBe(
      'color-mix(in oklab, #206560 12%, var(--card))',
    )
    expect(tableRow('Mine').className).toContain('print:bg-transparent')
    expect(tableRow('Theirs').style.getPropertyValue('--row-tint')).toBe('')
    expect(tableRow('Nobody').style.getPropertyValue('--row-tint')).toBe('')
  })

  it('uses the neutral muted tint when the wedding has no colour, or one that is not a hex', () => {
    view({ items: rows(), viewerId: ME, color: 'transparent' })
    expect(tableRow('Mine').style.getPropertyValue('--row-tint')).toBe('var(--muted)')
  })

  it('tints nothing when nobody is signed in as an owner', () => {
    view({ items: rows(), viewerId: null, color: '#206560' })
    expect(tableRow('Mine').style.getPropertyValue('--row-tint')).toBe('')
    // The unowned row is the one a missing `viewerId !== null` guard would tint (null === null).
    expect(tableRow('Nobody').style.getPropertyValue('--row-tint')).toBe('')
  })

  it('names the vendor and the owner together, and "Planner" only when there is neither', () => {
    view({
      items: [
        item({ id: 'i1', title: 'Dinner', vendorName: 'Traiteur A', ownerName: 'Katrien' }),
        item({ id: 'i2', title: 'Toast', startsAt: '10:00' }),
      ],
    })
    expect(within(tableRow('Dinner')).getByText('Traiteur A · Katrien')).toBeTruthy()
    expect(within(tableRow('Toast')).getByText('Planner')).toBeTruthy()
  })

  it('offers the owners, keeps an owner the viewer cannot offer, and sends the choice', () => {
    view({
      items: rows(),
      viewerId: ME,
      owners: [{ id: ME, name: 'Katrien' }],
    })
    fireEvent.click(within(tableRow('Theirs')).getByRole('button', { name: /Edit/ }))
    const select = screen.getByLabelText('Responsible') as HTMLSelectElement
    // Lore is not in this viewer's list (a member cannot see colleagues) but owns the row.
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Nobody', 'Katrien', 'Lore'])
    expect(select.value).toBe('u-2')

    fireEvent.change(select, { target: { value: ME } })
    fireEvent.submit(select.closest('form') as HTMLFormElement)
    expect(saveRunSheetItem).toHaveBeenCalledWith(
      W,
      'i2',
      expect.objectContaining({ ownerUserId: ME }),
    )
  })
})

/**
 * Spec 0009 A2: the run sheet makes its own first day. Both paths post through the settings
 * page's `saveEventAction`, mocked here, so what is asserted is what the view sends and where it
 * goes after, not the write itself (`settings/actions.test.ts` covers that).
 */
describe('starting the run sheet (spec 0009 A2)', () => {
  const posted = () => saveEventAction.mock.calls[0]?.[2] as FormData

  it('with a date and no days: one button, naming the short day, creating the main day', async () => {
    view({ events: [], mainDay: { label: 'Trouwdag', date: '2026-10-03' } })
    expect(screen.getByRole('heading', { name: 'No run sheet yet' })).toBeTruthy()
    // The form is the no-date path; with a date the one click is the whole offer.
    expect(screen.queryByRole('form', { name: 'Add a day' })).toBeNull()

    await act(async () => {
      // 'Sat, Oct 3' cannot see `formatCivilDay`'s UTC pin from here: this file runs in the
      // machine's zone, east of Greenwich, where the pin changes nothing. `lib/civil-date.test.ts`
      // runs in New York and is what fails if the pin goes.
      fireEvent.click(screen.getByRole('button', { name: 'Start the run sheet for Sat, Oct 3' }))
    })
    expect(saveEventAction).toHaveBeenCalledTimes(1)
    expect(saveEventAction.mock.calls[0]?.[0]).toBe(W)
    // The label arrives already in the wedding's language (Dutch here, the screen English).
    expect(posted().get('label')).toBe('Trouwdag')
    expect(posted().get('startsOn')).toBe('2026-10-03')
    expect(posted().get('eventId')).toBe('')
    expect(posted().get('intent')).toBe('save')
    expect(push).toHaveBeenCalledWith(`/weddings/${W}/run-sheet?event=e-new`)
  })

  it('offers no start button once the wedding has a day', () => {
    view({ mainDay: { label: 'Trouwdag', date: '2026-10-03' } })
    expect(screen.queryByRole('button', { name: /Start the run sheet/ })).toBeNull()
  })

  it('a refused start says so and goes nowhere', async () => {
    saveEventAction.mockResolvedValue({ form: 'forbidden' })
    view({ events: [], mainDay: { label: 'Trouwdag', date: '2026-10-03' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start the run sheet/ }))
    })
    expect(screen.getByRole('alert').textContent).toContain('That did not work')
    expect(push).not.toHaveBeenCalled()
  })

  it('without a date, the form posts the day through the event action and lands on it', async () => {
    view({ events: [], mainDay: { label: 'Trouwdag', date: null } })
    const form = screen.getByRole('form', { name: 'Add a day' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Brunch' } })
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2027-06-13' } })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add the day' }))
    })
    expect(saveEventAction.mock.calls[0]?.[0]).toBe(W)
    expect(posted().get('label')).toBe('Brunch')
    expect(posted().get('startsOn')).toBe('2027-06-13')
    expect(posted().get('eventId')).toBe('')
    expect(push).toHaveBeenCalledWith(`/weddings/${W}/run-sheet?event=e-new`)
  })

  it("shows the action's field error under the field and keeps the planner's draft", async () => {
    saveEventAction.mockResolvedValue({
      errors: { startsOn: 'required' },
      values: { label: 'Brunch', startsOn: '', startsAt: '' },
    })
    view({ events: [], mainDay: { label: 'Trouwdag', date: null } })
    const form = screen.getByRole('form', { name: 'Add a day' })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add the day' }))
    })
    expect(within(form).getByLabelText('Date')).toHaveAttribute('aria-invalid', 'true')
    expect(within(form).getByText('Fill this in.')).toBeTruthy()
    expect(within(form).getByLabelText('Name')).toHaveValue('Brunch')
    expect(push).not.toHaveBeenCalled()
  })

  it('the day tabs end with "Add a day", which opens the same form and closes on Cancel', () => {
    view({
      events: [
        event({ id: 'e1', label: 'Ceremony' }),
        event({ id: 'e2', label: 'Reception', startsOn: '2027-06-13' }),
      ],
    })
    const nav = screen.getByRole('navigation', { name: 'Days of the wedding' })
    const toggle = within(nav).getByRole('button', { name: 'Add a day' })
    // Last in the strip, after the day links.
    expect(nav.querySelector('li:last-child')?.contains(toggle)).toBe(true)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('form', { name: 'Add a day' })).toBeNull()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const form = screen.getByRole('form', { name: 'Add a day' })
    expect(toggle).toHaveAttribute('aria-controls', form.id)
    expect(document.activeElement).toBe(within(form).getByLabelText('Name'))

    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Add a day' })).toBeNull()
  })

  it('a start that throws (the trial lock does) says so and goes nowhere', async () => {
    saveEventAction.mockRejectedValue(new Error('locked'))
    view({ events: [], mainDay: { label: 'Trouwdag', date: '2026-10-03' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start the run sheet/ }))
    })
    expect(screen.getByRole('alert').textContent).toContain('That did not work')
    expect(push).not.toHaveBeenCalled()
  })

  it('a save that throws says so and keeps what was typed', async () => {
    saveEventAction.mockRejectedValue(new Error('locked'))
    view({ events: [], mainDay: { label: 'Trouwdag', date: null } })
    const form = screen.getByRole('form', { name: 'Add a day' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Brunch' } })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add the day' }))
    })
    expect(within(form).getByRole('alert').textContent).toContain('Saving did not work')
    // React 19 resets an uncontrolled form after its action; the echo is what puts it back.
    expect(within(form).getByLabelText('Name')).toHaveValue('Brunch')
    expect(push).not.toHaveBeenCalled()
  })

  it('a refused save names the refusal, not a generic failure', async () => {
    saveEventAction.mockResolvedValue({ form: 'forbidden' })
    view({ events: [], mainDay: { label: 'Trouwdag', date: null } })
    const form = screen.getByRole('form', { name: 'Add a day' })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add the day' }))
    })
    expect(within(form).getByRole('alert').textContent).toContain('you cannot change it')
  })

  it('a day saved from the tab strip closes the form and lands on the new day', async () => {
    view({
      events: [
        event({ id: 'e1', label: 'Ceremony' }),
        event({ id: 'e2', label: 'Reception', startsOn: '2027-06-13' }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add a day' }))
    const form = screen.getByRole('form', { name: 'Add a day' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Brunch' } })
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2027-06-14' } })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add the day' }))
    })
    expect(push).toHaveBeenCalledWith(`/weddings/${W}/run-sheet?event=e-new`)
    expect(screen.queryByRole('form', { name: 'Add a day' })).toBeNull()
  })

  it('one day has no tab strip, and still offers "Add a day"', () => {
    view({})
    expect(screen.queryByRole('navigation')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a day' }))
    expect(screen.getByRole('form', { name: 'Add a day' })).toBeTruthy()
  })
})

/**
 * Spec 0009 A3. The print layout is CSS (`print:` variants), which jsdom does not apply, so these
 * assert the markup paper is built from and the classes that switch it, not a rendered page.
 */
describe('printing the run sheet (spec 0009 A3)', () => {
  const rows = () => [
    item({
      id: 'i1',
      title: 'Dinner',
      startsAt: '14:00',
      durationMin: 30,
      vendorName: 'Traiteur A',
      vendorPhone: '+32 470 12 34 56',
      ownerName: 'Katrien',
      place: 'Orangerie',
    }),
    item({ id: 'i2', title: 'Toast', startsAt: '23:50', durationMin: 20, vendorName: 'DJ B' }),
  ]
  const printSheet = () => document.querySelector('[data-print-sheet]') as HTMLElement

  it('a Print button opens the browser print dialog', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    view({ items: rows() })
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })

  it('offers no Print button for a day with nothing on it', () => {
    view({ items: [] })
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull()
  })

  it('has a print-only header: the couple, the day and its date, the studio', () => {
    view({ items: rows() })
    const sheet = printSheet()
    expect(sheet.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'print:block']))
    const header = sheet.querySelector('p') as HTMLElement
    expect(header.textContent).toBe('Els & Jan·Ceremony June 12, 2027·Studio Lore')
  })

  it('prints start, end, what, who with the vendor phone, and where; screen rows stay off paper', () => {
    view({ items: rows() })
    const cells = Array.from(printSheet().querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
    )
    expect(cells).toEqual([
      ['14:00', '14:30', 'Dinner', 'Traiteur A (+32 470 12 34 56) · Katrien', 'Orangerie'],
      // Ends after midnight: the end carries the day mark, the start does not.
      ['23:50', '00:10 +1', 'Toast', 'DJ B', ''],
    ])
    // The screen table and the phone list, warnings and buttons with them, do not print.
    expect(screen.getByRole('table').closest('.print\\:hidden')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Print' }).closest('.print\\:hidden')).not.toBeNull()
    // jsdom draws the phone list too (no media queries); on paper it would print the day twice.
    const phoneList = document.querySelector('ul.md\\:hidden') as HTMLElement
    expect(phoneList.classList).toContain('print:hidden')
    // The day's own line: the print header already says it.
    expect(screen.getByText('Ceremony').parentElement?.classList).toContain('print:hidden')
  })

  it('keeps an open "Add a day" form off paper', () => {
    view({ items: rows() })
    fireEvent.click(screen.getByRole('button', { name: 'Add a day' }))
    const form = screen.getByRole('form', { name: 'Add a day' })
    expect(form.closest('.print\\:hidden')).not.toBeNull()
  })

  it('marks a START after midnight +1 on paper, and prints "Planner" when nobody else is named', () => {
    view({
      items: [
        item({ id: 'i1', title: 'Toast', startsAt: '23:50', durationMin: 20, vendorName: 'DJ B' }),
        item({ id: 'i2', title: 'Taxis', startsAt: '00:30', durationMin: 15 }),
      ],
    })
    const cells = Array.from(printSheet().querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
    )
    expect(cells[1]).toEqual(['00:30 +1', '00:45 +1', 'Taxis', 'Planner', ''])
  })

  it('leaves the studio, and its separator, out of the header when there is no name', () => {
    view({ items: rows(), studioName: '' })
    const header = printSheet().querySelector('p') as HTMLElement
    expect(header.textContent).toBe('Els & Jan·Ceremony June 12, 2027')
  })
})

/**
 * Spec 0009 B2: shift an item and everything after it. The action is mocked, so what is asserted
 * is the preview the planner reads before pressing, and what the sheet sends; the write itself
 * is `actions.test.ts` and `packages/db/test/run-sheet-repo.test.ts`.
 */
describe('shifting the rest of the day (spec 0009 B2)', () => {
  const day = () => [
    item({ id: 'i1', title: 'Ceremony', startsAt: '15:30', durationMin: 40 }),
    item({ id: 'i2', title: 'Dinner', startsAt: '19:00', durationMin: 120 }),
    item({ id: 'i3', title: 'Cake', startsAt: '23:50', durationMin: 20 }),
    item({ id: 'i4', title: 'Last song', startsAt: '00:30', durationMin: 30 }),
  ]
  const edit = (title: string) => {
    const [button] = screen.getAllByRole('button', { name: `Edit ${title}` })
    if (!button) throw new Error(`no edit button for ${title}`)
    fireEvent.click(button)
  }
  const section = () => screen.getByRole('region', { name: 'Shift this and everything after it' })
  /** Each previewed row as "old new title", read from the struck and the plain time. */
  const preview = () =>
    within(within(section()).getByRole('list', { name: 'What moves' }))
      .getAllByRole('listitem')
      .map((li) => {
        const old = li.querySelector('s')?.textContent
        const now = li.querySelector('s + span')?.textContent
        return `${old} ${now} ${li.lastElementChild?.textContent}`
      })

  it('is offered when editing an item, never when adding one', () => {
    view({ items: day() })
    fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
    expect(screen.getByRole('dialog', { name: 'New item' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Shift this and everything after it' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    edit('Dinner')
    expect(section()).toBeTruthy()
    // Counted before any step is chosen: this item and the two after it, not the one above.
    const submit = within(section()).getByRole('button', { name: 'Shift 3 items' })
    expect(submit).toBeDisabled()
    expect(within(section()).queryByRole('list')).toBeNull()
  })

  it('a chip previews every item that moves, wrapping past midnight, and sends the shift', async () => {
    view({ items: day() })
    edit('Dinner')
    fireEvent.click(within(section()).getByRole('button', { name: '+15 min' }))
    expect(within(section()).getByRole('button', { name: '+15 min' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(preview()).toEqual(['19:00 19:15 Dinner', '23:50 00:05 Cake', '00:30 00:45 Last song'])
    // The screen-reader reading says the same in words, since a strike-through is not announced.
    expect(within(section()).getByText('Cake: from 23:50 to 00:05')).toBeTruthy()

    await act(async () => {
      fireEvent.click(within(section()).getByRole('button', { name: 'Shift 3 items' }))
    })
    expect(shiftRunSheetFrom).toHaveBeenCalledWith(W, 'i2', 15)
    expect(within(section()).getByRole('status').textContent).toBe('3 items shifted.')
    // The form's start takes the new time, so a Save after the shift does not undo it.
    expect((screen.getByLabelText('Starts at') as HTMLInputElement).value).toBe('19:15')
  })

  it('the minus chip wraps backwards over midnight, and one item reads in the singular', async () => {
    view({ items: day() })
    edit('Last song')
    fireEvent.click(within(section()).getByRole('button', { name: '−15 min' }))
    expect(preview()).toEqual(['00:30 00:15 Last song'])
    // Back to the cake's own 23:50: a tie with the item above, which is allowed.
    fireEvent.change(within(section()).getByLabelText('Or your own number of minutes'), {
      target: { value: '-40' },
    })
    expect(preview()).toEqual(['00:30 23:50 Last song'])
    expect(within(section()).queryByRole('alert')).toBeNull()
    await act(async () => {
      fireEvent.click(within(section()).getByRole('button', { name: 'Shift 1 item' }))
    })
    expect(shiftRunSheetFrom).toHaveBeenCalledWith(W, 'i4', -40)
  })

  it('a backward shift past the item above is refused in place, with the preview still shown', async () => {
    view({ items: day() })
    edit('Last song')
    const field = within(section()).getByLabelText('Or your own number of minutes')
    const submit = within(section()).getByRole('button', { name: 'Shift 1 item' })
    // 00:30 - 45 is 23:45, before the cake's 23:50: the clock would read it as the next night.
    fireEvent.change(field, { target: { value: '-45' } })
    expect(within(section()).getByRole('alert').textContent).toContain(
      'Then this item would start before the one above it.',
    )
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(submit).toBeDisabled()
    expect(preview()).toEqual(['00:30 23:45 Last song'])
    // The button is the only way to send (Enter in the field does nothing), and it is disabled.
    await act(async () => {
      fireEvent.click(submit)
    })
    expect(shiftRunSheetFrom).not.toHaveBeenCalled()
  })

  it("the repo's refusal of a crossing reads the same, should the list have been stale", async () => {
    shiftRunSheetFrom.mockResolvedValue({ ok: false, error: 'shiftCrosses' })
    view({ items: day() })
    edit('Dinner')
    fireEvent.click(within(section()).getByRole('button', { name: '−15 min' }))
    await act(async () => {
      fireEvent.click(within(section()).getByRole('button', { name: 'Shift 3 items' }))
    })
    expect(within(section()).getByRole('alert').textContent).toContain(
      'Then this item would start before the one above it.',
    )
  })

  it('a custom value outside -720..720, or 0, is refused in place and cannot be sent', () => {
    view({ items: day() })
    edit('Ceremony')
    const field = within(section()).getByLabelText('Or your own number of minutes')
    const submit = within(section()).getByRole('button', { name: 'Shift 4 items' })
    for (const bad of ['721', '-721', '0', '1.5', 'soon']) {
      fireEvent.change(field, { target: { value: bad } })
      expect(within(section()).getByRole('alert').textContent).toContain(
        'Enter whole minutes, from -720 to 720, not 0.',
      )
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(submit).toBeDisabled()
      expect(within(section()).queryByRole('list')).toBeNull()
    }
    for (const good of ['720', '-720']) {
      fireEvent.change(field, { target: { value: good } })
      expect(within(section()).queryByRole('alert')).toBeNull()
      expect(submit).toBeEnabled()
    }
    expect(preview()[0]).toBe('15:30 03:30 Ceremony')
  })

  it('a refused shift shows the error and keeps the draft to try again', async () => {
    shiftRunSheetFrom.mockResolvedValue({ ok: false, error: 'failed' })
    view({ items: day() })
    edit('Dinner')
    const field = within(section()).getByLabelText('Or your own number of minutes')
    fireEvent.change(field, { target: { value: '20' } })
    await act(async () => {
      fireEvent.click(within(section()).getByRole('button', { name: 'Shift 3 items' }))
    })
    expect(within(section()).getByRole('alert').textContent).toContain('Saving did not work')
    expect((field as HTMLInputElement).value).toBe('20')
    expect(preview()[0]).toBe('19:00 19:20 Dinner')
    expect(within(section()).getByRole('status').textContent).toBe('')
    // The item's own start is left alone: nothing moved.
    expect((screen.getByLabelText('Starts at') as HTMLInputElement).value).toBe('19:00')
  })
})
