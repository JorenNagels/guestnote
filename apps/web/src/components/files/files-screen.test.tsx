import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type FileItem, type FilesActions, FilesScreen } from './files-screen.tsx'
import { FILES_LABELS } from './fixtures.ts'

/**
 * The Files screen with its Server Functions replaced by fakes. What is pinned: the list says
 * what is internal, each action calls the right function with the right arguments, a failure is
 * shown beside the row it belongs to, and an upload runs sign -> PUT -> confirm and refreshes.
 * The order of those three is `upload.test.ts`'s; here it is only that this screen wires it.
 *
 * `waitFor` polls with real timers here, so the fake-timer trap in CLAUDE.md does not apply.
 */
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const ITEMS: FileItem[] = [
  {
    id: 'f1',
    name: 'Contract.pdf',
    mime: 'application/pdf',
    sizeBytes: 2 * 1024 * 1024,
    visibility: 'shared',
    uploadedByName: 'Els',
    // 00:30 on the 5th in Brussels, still the 4th anywhere west of Greenwich: the only
    // way a wrong `timeZone` in the component is visible.
    createdAt: '2026-03-04T23:30:00Z',
  },
  {
    id: 'f2',
    name: 'Florist invoice.pdf',
    mime: 'application/pdf',
    sizeBytes: 1024,
    visibility: 'internal',
    uploadedByName: null,
    createdAt: '2026-03-05T10:00:00Z',
  },
]

const ok = { ok: true } as const
let actions: { [K in keyof FilesActions]: ReturnType<typeof vi.fn> }
const navigate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  actions = {
    start: vi.fn(async () => ({
      ok: true,
      fileId: 'new1',
      url: 'https://s3.example/put',
      headers: { 'Content-Type': 'application/pdf' },
    })),
    confirm: vi.fn(async () => ok),
    remove: vi.fn(async () => ok),
    rename: vi.fn(async () => ok),
    setVisibility: vi.fn(async () => ok),
    download: vi.fn(async () => 'https://s3.example/get'),
  }
})

const view = (items: readonly FileItem[] = ITEMS) =>
  render(
    <FilesScreen
      items={items}
      locale="en"
      labels={FILES_LABELS}
      actions={actions as unknown as FilesActions}
      navigate={navigate}
    />,
  )

describe('list', () => {
  it('says which files are internal, and only those', () => {
    view()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0] as HTMLElement).queryByText('Internal only')).toBeNull()
    expect(within(rows[1] as HTMLElement).getByText('Internal only')).toBeInTheDocument()
  })

  it('describes type, size, uploader and date in the Brussels calendar', () => {
    view()
    expect(screen.getByText(/PDF · 2\.0 MB · by Els · Mar 5, 2026/)).toBeInTheDocument()
    // No uploader (a deleted user) leaves no dangling "by".
    expect(screen.getByText(/PDF · 1\.0 KB · Mar 5, 2026/)).toBeInTheDocument()
  })

  it('shows the empty state and no table', () => {
    view([])
    expect(screen.getByText('No files yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('gives every row button an accessible name that says which file', () => {
    view()
    expect(screen.getByRole('button', { name: 'Download Contract.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make Contract.pdf internal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share Florist invoice.pdf' })).toBeInTheDocument()
  })
})

describe('row actions', () => {
  it('download navigates to the freshly signed URL', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Download Contract.pdf' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://s3.example/get'))
    expect(actions.download).toHaveBeenCalledWith('f1')
  })

  it('shows not-found beside the row when the download URL is null', async () => {
    actions.download.mockResolvedValue(null)
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Download Contract.pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('toggles visibility in both directions and refreshes', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Make Contract.pdf internal' }))
    await waitFor(() => expect(actions.setVisibility).toHaveBeenCalledWith('f1', 'internal'))
    fireEvent.click(screen.getByRole('button', { name: 'Share Florist invoice.pdf' }))
    await waitFor(() => expect(actions.setVisibility).toHaveBeenCalledWith('f2', 'shared'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  })

  it('renames through an inline field, prefilled, and Escape abandons it', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Contract.pdf' }))
    const field = screen.getByLabelText('New name')
    expect(field).toHaveValue('Contract.pdf')

    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByLabelText('New name')).toBeNull()
    expect(actions.rename).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Contract.pdf' }))
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'Signed.pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.rename).toHaveBeenCalledWith('f1', 'Signed.pdf'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('asks before removing, and removing does nothing until confirmed', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Contract.pdf' }))
    expect(actions.remove).not.toHaveBeenCalled()
    expect(screen.getByText('Remove “Contract.pdf”?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(actions.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Contract.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith('f1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows a refusal on the row it came from and leaves the others clean', async () => {
    actions.rename.mockResolvedValue({ ok: false, error: 'invalid_name' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Contract.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Bad name')
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0] as HTMLElement).getByRole('alert')).toBe(alert)
    expect(within(rows[1] as HTMLElement).queryByRole('alert')).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reports a rejected Server Function as a connection problem', async () => {
    actions.remove.mockRejectedValue(new Error('boom'))
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Contract.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection')
  })
})

describe('upload', () => {
  const pdf = () => new File(['%PDF'], 'quote.pdf', { type: 'application/pdf' })
  const choose = (files: File[]) =>
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files } })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
  })

  it('runs sign, PUT, confirm, then refreshes once', async () => {
    view()
    await act(async () => choose([pdf()]))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    expect(actions.start).toHaveBeenCalledWith({
      name: 'quote.pdf',
      mime: 'application/pdf',
      sizeBytes: 4,
      visibility: 'shared',
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://s3.example/put',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(actions.confirm).toHaveBeenCalledWith('new1')
  })

  it('marks the next uploads internal when the box is ticked', async () => {
    view()
    fireEvent.click(screen.getByLabelText('Internal only next'))
    await act(async () => choose([pdf()]))
    await waitFor(() => expect(actions.start).toHaveBeenCalled())
    expect(actions.start).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'internal' }))
  })

  it('keeps a refused file listed with its reason until dismissed, and does not refresh', async () => {
    actions.start.mockResolvedValue({ ok: false, error: 'type_not_allowed' })
    view()
    await act(async () => choose([pdf()]))

    expect(await screen.findByRole('alert')).toHaveTextContent('Type not allowed')
    expect(screen.getByText('quote.pdf')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('quote.pdf')).toBeNull()
  })

  it('accepts a drop as well as a pick', async () => {
    view()
    const zone = screen.getByRole('region', { name: 'Add files' })
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } })
    })
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledWith('new1'))
  })
})
