import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOODBOARD_LABELS } from './fixtures.ts'
import { type MoodboardActions, MoodboardScreen, type MoodTile } from './moodboard-screen.tsx'

/**
 * The moodboard with its Server Functions replaced by fakes. Pinned here: a tile draws its
 * signed URL and falls back to a placeholder without one, the caption is editable in place,
 * remove asks first, and a new image's caption is its file name without the extension and is
 * always shared.
 */
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const TILES: MoodTile[] = [
  { id: 'i1', name: 'Peonies', url: 'https://s3.example/p' },
  { id: 'i2', name: 'Table', url: null },
]

const ok = { ok: true } as const
let actions: { [K in keyof MoodboardActions]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.clearAllMocks()
  actions = {
    start: vi.fn(async () => ({
      ok: true,
      fileId: 'new1',
      url: 'https://s3.example/put',
      headers: { 'Content-Type': 'image/jpeg' },
    })),
    confirm: vi.fn(async () => ok),
    remove: vi.fn(async () => ok),
    rename: vi.fn(async () => ok),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
})

const view = (items: readonly MoodTile[] = TILES) =>
  render(
    <MoodboardScreen
      items={items}
      labels={MOODBOARD_LABELS}
      actions={actions as unknown as MoodboardActions}
    />,
  )

describe('tiles', () => {
  it('draws the signed URL with the caption as alt text, and a placeholder without one', () => {
    view()
    expect(screen.getByRole('img', { name: 'Peonies' })).toHaveAttribute(
      'src',
      'https://s3.example/p',
    )
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByText('Image not available')).toBeInTheDocument()
  })

  it('shows the empty state for no images', () => {
    view([])
    expect(screen.getByText('No images yet')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('caption', () => {
  it('edits in place, prefilled, and saves through rename', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit the caption of Peonies' }))
    const field = screen.getByLabelText('Caption')
    expect(field).toHaveValue('Peonies')
    fireEvent.change(field, { target: { value: 'White peonies' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.rename).toHaveBeenCalledWith('i1', 'White peonies'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('Escape leaves the caption alone', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit the caption of Peonies' }))
    fireEvent.keyDown(screen.getByLabelText('Caption'), { key: 'Escape' })
    expect(screen.queryByLabelText('Caption')).toBeNull()
    expect(actions.rename).not.toHaveBeenCalled()
  })

  it('shows a refused caption beside its tile', async () => {
    actions.rename.mockResolvedValue({ ok: false, error: 'invalid_name' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit the caption of Peonies' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad name')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('remove', () => {
  it('asks first and only then calls remove', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Peonies' }))
    expect(actions.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith('i1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe('add', () => {
  it('captions a new image with its file name minus the extension, shared, and refreshes', async () => {
    view()
    const photo = new File(['x'], 'IMG_2031.jpeg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [photo] } })
    })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(actions.start).toHaveBeenCalledWith({
      name: 'IMG_2031',
      mime: 'image/jpeg',
      sizeBytes: 1,
      visibility: 'shared',
    })
    expect(actions.confirm).toHaveBeenCalledWith('new1')
  })

  it('only offers images in the file picker', () => {
    view()
    expect(screen.getByTestId('upload-input')).toHaveAttribute('accept', 'image/*')
  })
})
