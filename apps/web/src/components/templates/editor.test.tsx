import type { TemplateDetail } from '@guestnote/db'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WithMessages } from './intl.test-util.tsx'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const addItemAction = vi.fn()
const applyTemplateAction = vi.fn()
const deleteItemAction = vi.fn()
const deleteTemplateAction = vi.fn()
const duplicateTemplateAction = vi.fn()
const moveItemAction = vi.fn()
const updateItemAction = vi.fn()
const updateTemplateAction = vi.fn()
vi.mock('../../app/pro/(app)/templates/[templateId]/actions.ts', () => ({
  addItemAction: (...a: unknown[]) => addItemAction(...a),
  applyTemplateAction: (...a: unknown[]) => applyTemplateAction(...a),
  deleteItemAction: (...a: unknown[]) => deleteItemAction(...a),
  deleteTemplateAction: (...a: unknown[]) => deleteTemplateAction(...a),
  duplicateTemplateAction: (...a: unknown[]) => duplicateTemplateAction(...a),
  moveItemAction: (...a: unknown[]) => moveItemAction(...a),
  updateItemAction: (...a: unknown[]) => updateItemAction(...a),
  updateTemplateAction: (...a: unknown[]) => updateTemplateAction(...a),
}))

const { TemplateEditor } = await import('./editor.tsx')

// The dates and offsets match packages/db/test/templates-repo.test.ts exactly, so "2026-10-04"
// is a value already proven correct against the repo's own arithmetic, not a hand-computed one.
const TEMPLATE: TemplateDetail = {
  id: 'tpl-1',
  name: 'Full planning',
  description: 'Everything, start to finish',
  items: [
    {
      id: 'i1',
      title: 'Sign the venue contract',
      dueOffsetDays: -300,
      visibility: 'shared',
      assigneeRole: 'planner',
      position: 0,
    },
    {
      id: 'i2',
      title: 'Agree the planning fee schedule',
      dueOffsetDays: -240,
      visibility: 'internal',
      assigneeRole: 'couple',
      position: 1,
    },
  ],
}

const WEDDINGS = [
  { id: 'w1', name: 'Anna & Bram', date: '2027-07-31' },
  { id: 'w2', name: 'No Date Yet', date: null },
]

const editor = (
  props: Partial<{
    template: TemplateDetail
    canWrite: boolean
    weddings: typeof WEDDINGS
    defaultWeddingId: string | null
  }> = {},
) =>
  render(
    <WithMessages>
      <TemplateEditor
        template={props.template ?? TEMPLATE}
        canWrite={props.canWrite ?? true}
        weddings={props.weddings ?? WEDDINGS}
        defaultWeddingId={props.defaultWeddingId === undefined ? 'w1' : props.defaultWeddingId}
      />
    </WithMessages>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  addItemAction.mockResolvedValue({ ok: true })
  applyTemplateAction.mockResolvedValue({ ok: true, count: 2 })
  deleteTemplateAction.mockResolvedValue({ ok: true })
  duplicateTemplateAction.mockResolvedValue({ ok: true, id: 'tpl-2' })
  moveItemAction.mockResolvedValue({ ok: true })
})

describe('the plan table', () => {
  it('shows the T-minus offset, the internal pill, and the resolved date for the picked wedding', () => {
    editor()
    expect(screen.getByText('T-300')).toBeInTheDocument()
    expect(screen.getByText('T-240')).toBeInTheDocument()
    // `selector: 'span'` and not the bare string: the add-item row's visibility <option> carries
    // the identical Dutch text, and the two must not collide in one assertion.
    expect(screen.getByText('Alleen intern', { selector: 'span' })).toBeInTheDocument()
    // -300 days from 2027-07-31, the same case the repo test proves.
    expect(screen.getByText(/4 okt\.? 2026/)).toBeInTheDocument()
  })

  it('shows "-" and no date when no wedding is picked', () => {
    editor({ defaultWeddingId: null })
    expect(screen.getAllByText('Geen datum', { selector: '.sr-only' })).toHaveLength(2)
  })

  it('redraws Becomes when a different wedding is picked, without a server round trip', () => {
    editor()
    fireEvent.change(screen.getByLabelText('Bruiloft'), { target: { value: 'w2' } })
    expect(screen.getAllByText('Geen datum', { selector: '.sr-only' })).toHaveLength(2)
    expect(screen.queryByText(/2026/)).toBeNull()
  })
})

describe('read-only for a member', () => {
  it('hides order arrows, edit, duplicate and the add row, but keeps apply', () => {
    editor({ canWrite: false })
    expect(screen.queryByRole('button', { name: /omhoog/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bewerken' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dupliceren' })).toBeNull()
    expect(screen.queryByText('Taak toevoegen')).toBeNull()
    expect(screen.getByRole('button', { name: 'Toepassen op deze bruiloft' })).toBeInTheDocument()
  })
})

describe('reordering', () => {
  it('disables moving the first item up and the last item down', () => {
    editor()
    expect(screen.getByRole('button', { name: /Sign the venue contract omhoog/ })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Agree the planning fee schedule omlaag/ }),
    ).toBeDisabled()
  })

  it('moves an enabled item and shows the error banner when the action refuses', async () => {
    moveItemAction.mockResolvedValue({ ok: false, error: 'notFound' })
    editor()
    fireEvent.click(screen.getByRole('button', { name: /Sign the venue contract omlaag/ }))
    await waitFor(() => expect(moveItemAction).toHaveBeenCalledWith('tpl-1', 'i1', 'down'))
    expect(await screen.findByText(/Niet gevonden/)).toBeInTheDocument()
  })
})

describe('adding an item', () => {
  it('submits the row and clears title and days but keeps owner and visibility', async () => {
    editor()
    fireEvent.change(screen.getByLabelText('Taak'), { target: { value: 'Book the florist' } })
    fireEvent.change(screen.getByLabelText('Dagen'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Zichtbaarheid'), { target: { value: 'internal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    await waitFor(() =>
      expect(addItemAction).toHaveBeenCalledWith('tpl-1', {
        title: 'Book the florist',
        offsetDays: '30',
        offsetDirection: 'before',
        assigneeRole: 'planner',
        visibility: 'internal',
      }),
    )
    await waitFor(() => expect(screen.getByLabelText('Taak')).toHaveValue(''))
    expect(screen.getByLabelText('Zichtbaarheid')).toHaveValue('internal')
  })
})

describe('applying to a wedding', () => {
  it('applies, reports the count, and links to that wedding checklist', async () => {
    editor()
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen op deze bruiloft' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 taken toegevoegd aan Anna & Bram',
    )
    expect(applyTemplateAction).toHaveBeenCalledWith('tpl-1', 'w1')
    expect(screen.getByRole('link', { name: 'Bekijk de checklist' })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks',
    )
  })

  it('disables Apply when the template has no items', () => {
    editor({ template: { ...TEMPLATE, items: [] } })
    expect(screen.getByRole('button', { name: 'Toepassen op deze bruiloft' })).toBeDisabled()
  })

  it('says there is no wedding yet instead of offering the picker', () => {
    editor({ weddings: [], defaultWeddingId: null })
    expect(
      screen.getByText('Er is nog geen bruiloft om dit sjabloon op toe te passen.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Bruiloft')).toBeNull()
  })
})

describe('duplicate and delete', () => {
  it('duplicates and navigates to the copy', async () => {
    editor()
    fireEvent.click(screen.getByRole('button', { name: 'Dupliceren' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/templates/tpl-2'))
  })

  it('deletes only after the confirm step, then navigates to the list', async () => {
    editor()
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sjabloon verwijderen' }))
    expect(deleteTemplateAction).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ja, verwijder' }))
    await waitFor(() => expect(deleteTemplateAction).toHaveBeenCalledWith('tpl-1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/templates'))
  })
})
