import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WithMessages } from './intl.test-util.tsx'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const createTemplateAction = vi.fn()
vi.mock('../../app/pro/(app)/templates/actions.ts', () => ({
  createTemplateAction: (...a: unknown[]) => createTemplateAction(...a),
}))

const { TemplateList } = await import('./list-view.tsx')

const TEMPLATES = [
  { id: 't1', name: 'Full planning', description: 'Everything, start to finish', itemCount: 12 },
  { id: 't2', name: 'Day-of only', description: null, itemCount: 0 },
]

beforeEach(() => {
  vi.clearAllMocks()
  createTemplateAction.mockResolvedValue({ ok: true, id: 'new-id' })
})

describe('TemplateList', () => {
  it('shows each template as a card with its item count, and no create button read-only', () => {
    render(
      <WithMessages>
        <TemplateList templates={TEMPLATES} canWrite={false} />
      </WithMessages>,
    )
    expect(screen.getByText('Full planning')).toBeInTheDocument()
    expect(screen.getByText('12 taken')).toBeInTheDocument()
    expect(screen.getByText('0 taken')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nieuw sjabloon' })).toBeNull()
  })

  it('shows the empty state, worded for whether the reader can write', () => {
    const { rerender } = render(
      <WithMessages>
        <TemplateList templates={[]} canWrite={true} />
      </WithMessages>,
    )
    expect(screen.getByText('Nog geen sjablonen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nieuw sjabloon' })).toBeInTheDocument()

    rerender(
      <WithMessages>
        <TemplateList templates={[]} canWrite={false} />
      </WithMessages>,
    )
    expect(screen.getByText(/Een eigenaar of beheerder/)).toBeInTheDocument()
  })

  it('creates a template and navigates straight to its editor', async () => {
    render(
      <WithMessages>
        <TemplateList templates={[]} canWrite={true} />
      </WithMessages>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw sjabloon' }))
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Elopement' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/templates/new-id'))
    expect(createTemplateAction).toHaveBeenCalledWith({ name: 'Elopement', description: '' })
  })

  it('keeps the sheet open and shows the error when the action refuses', async () => {
    createTemplateAction.mockResolvedValue({ ok: false, error: 'name' })
    render(
      <WithMessages>
        <TemplateList templates={[]} canWrite={true} />
      </WithMessages>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw sjabloon' }))
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(await screen.findByText(/hoogstens 120 tekens/)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
