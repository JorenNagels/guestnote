import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_LABELS } from '../toast/fixtures.ts'
import { ToastProvider } from '../toast/toast-provider.tsx'
import type { BoardActions, Boards } from './board-bar.tsx'
import { MOODBOARD_LABELS } from './fixtures.ts'
import { type MoodboardActions, MoodboardScreen, type MoodTile } from './moodboard-screen.tsx'

/**
 * The moodboard with its Server Functions replaced by fakes. Pinned here: a tile draws its
 * signed URL and falls back to a placeholder without one, the caption is editable in place,
 * remove happens at once with Undo (spec 0009 C4), and a new image's caption is its file name without the extension and is
 * always shared. And since spec 0007, the board bar: switcher links, the header's audience,
 * create, delete (never the default board), move, and the share sheet's save-per-tick.
 */
const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))

const TILES: MoodTile[] = [
  { id: 'i1', name: 'Peonies', url: 'https://s3.example/p' },
  { id: 'i2', name: 'Table', url: null },
]

const ok = { ok: true } as const
let actions: { [K in keyof MoodboardActions]: ReturnType<typeof vi.fn> }
let boardActions: { [K in keyof BoardActions]: ReturnType<typeof vi.fn> }

const MAIN = {
  id: 'b-main',
  name: 'Moodboard',
  isDefault: true,
  sharedWithCouple: false,
  imageCount: 2,
  sharedWith: [],
}
const PHOTO = {
  id: 'b-photo',
  name: 'Fotograaf',
  isDefault: false,
  sharedWithCouple: true,
  imageCount: 3,
  sharedWith: ['wv-lens'],
}
const boardsOn = (current: string, hasLink: boolean | null = true): Boards => ({
  list: [MAIN, PHOTO],
  current,
  weddingId: 'w1',
  vendors: [
    { id: 'wv-lens', name: 'Studio Lens', category: 'Photography', hasLink },
    { id: 'wv-els', name: 'Bloemen Els', category: 'Flowers', hasLink: false },
  ],
})

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
    restore: vi.fn(async () => ok),
    rename: vi.fn(async () => ok),
    move: vi.fn(async () => ok),
  }
  boardActions = {
    create: vi.fn(async () => ({ ok: true, id: 'b-new' })),
    rename: vi.fn(async () => ok),
    remove: vi.fn(async () => ok),
    share: vi.fn(async () => ok),
    shareCouple: vi.fn(async () => ok),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
})

const view = (items: readonly MoodTile[] = TILES, boards: Boards = boardsOn(MAIN.id)) =>
  render(
    <ToastProvider labels={TOAST_LABELS}>
      <MoodboardScreen
        items={items}
        labels={MOODBOARD_LABELS}
        actions={actions as unknown as MoodboardActions}
        boards={boards}
        boardActions={boardActions as unknown as BoardActions}
      />
    </ToastProvider>,
  )

const toast = () => within(screen.getByTestId('toast')).getByRole('status')

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
    view([], { ...boardsOn(MAIN.id), list: [MAIN] })
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
    actions.rename.mockResolvedValue({ ok: false, error: 'invalidName' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit the caption of Peonies' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad name')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('remove', () => {
  /** Spec 0009 C4: an image is a soft delete, so it goes at once and Undo brings it back. */
  it('removes at once, then offers Undo by caption, which restores and refreshes', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Peonies' }))
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith('i1'))
    await waitFor(() => expect(toast()).toHaveTextContent('Image “Peonies” removed.'))
    expect(refresh).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(actions.restore).toHaveBeenCalledWith('i1'))
    await waitFor(() => expect(toast()).toHaveTextContent('Restored.'))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('says so when the image cannot come back', async () => {
    actions.restore.mockResolvedValue({ ok: false, error: 'notFound' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Peonies' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(toast()).toHaveTextContent('This can no longer be restored.'))
  })
})

describe('caption pencil (spec 0009 C4, report 13b)', () => {
  /**
   * jsdom computes no `:hover`, so what can be pinned is that the pencil is there, is decorative,
   * and carries the hover and focus classes that reveal it; that it then shows is the browser's.
   */
  it('puts a decorative pencil in the caption button, revealed on hover and focus', () => {
    view()
    const caption = screen.getByRole('button', { name: 'Edit the caption of Peonies' })
    const pencil = caption.querySelector('svg')
    expect(pencil).not.toBeNull()
    expect(pencil).toHaveAttribute('aria-hidden', 'true')
    expect(caption).toHaveClass('group')
    expect(pencil).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-visible:opacity-100',
    )
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

describe('boards (spec 0007)', () => {
  it('lists every board as a link, marks the current one, and names its audience', () => {
    view(TILES, boardsOn(PHOTO.id))
    const nav = screen.getByRole('navigation', { name: 'Boards' })
    const current = nav.querySelector('[aria-current="page"]')
    expect(current).toHaveTextContent('Fotograaf')
    expect(current).toHaveAttribute('href', '/weddings/w1/moodboard?bord=b-photo')
    expect(screen.getByText('Shared with: Couple · Studio Lens')).toBeInTheDocument()
  })

  it('says "Not shared" for a board nobody sees', () => {
    view()
    expect(screen.getByText('Not shared')).toBeInTheDocument()
  })

  it('never offers to delete the default board', () => {
    view()
    expect(screen.queryByRole('button', { name: 'Delete board' })).toBeNull()
  })

  it('asks with the image count before deleting, then goes to the default board', async () => {
    // Default board listed SECOND, so "the default" and "the first" cannot be confused.
    view(TILES, { ...boardsOn(PHOTO.id), list: [PHOTO, MAIN] })
    fireEvent.click(screen.getByRole('button', { name: 'Delete board' }))
    expect(screen.getByText('Delete the board and 3 images?')).toBeInTheDocument()
    expect(boardActions.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(boardActions.remove).toHaveBeenCalledWith('b-photo'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/weddings/w1/moodboard?bord=b-main'))
  })

  it('creates a board and opens it', async () => {
    view()
    fireEvent.click(screen.getAllByRole('button', { name: '+ New board' })[0] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: 'Bloemen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save board' }))
    await waitFor(() => expect(boardActions.create).toHaveBeenCalledWith('Bloemen'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/weddings/w1/moodboard?bord=b-new'))
  })

  it('shows a refused board name and stays put', async () => {
    boardActions.create.mockResolvedValue({ ok: false, error: 'invalidName' })
    view()
    fireEvent.click(screen.getAllByRole('button', { name: '+ New board' })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Save board' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad board name')
    expect(push).not.toHaveBeenCalled()
  })

  it('moves an image to another board, offering only the others', async () => {
    view()
    const select = screen.getByRole('combobox', { name: 'Move Peonies to another board' })
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Move to…',
      'Fotograaf',
    ])
    fireEvent.change(select, { target: { value: 'b-photo' } })
    await waitFor(() => expect(actions.move).toHaveBeenCalledWith('i1', 'b-photo'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe('switching boards', () => {
  it('closes a delete confirm begun on the previous board', () => {
    const { rerender } = view(TILES, boardsOn(PHOTO.id))
    fireEvent.click(screen.getByRole('button', { name: 'Delete board' }))
    expect(screen.getByText('Delete the board and 3 images?')).toBeInTheDocument()
    // What a pill click does: the same route, a new `current`.
    rerender(
      <MoodboardScreen
        items={TILES}
        labels={MOODBOARD_LABELS}
        actions={actions as unknown as MoodboardActions}
        boards={{
          ...boardsOn(PHOTO.id),
          list: [MAIN, PHOTO, { ...PHOTO, id: 'b3', name: 'Bloemen' }],
          current: 'b3',
        }}
        boardActions={boardActions as unknown as BoardActions}
      />,
    )
    expect(screen.queryByText(/Delete the board and/)).toBeNull()
  })

  it('names the board in the empty state once there is more than one', () => {
    view([], boardsOn(PHOTO.id))
    expect(screen.getByText('No images on this board yet.')).toBeInTheDocument()
  })
})

describe('the share sheet', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    return screen.getByRole('dialog', { name: 'Share Fotograaf' })
  }

  it('saves the whole vendor list on each tick', async () => {
    view(TILES, boardsOn(PHOTO.id))
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: /Bloemen Els/ }))
    await waitFor(() =>
      expect(boardActions.share).toHaveBeenCalledWith('b-photo', ['wv-lens', 'wv-els']),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Studio Lens/ }))
    await waitFor(() => expect(boardActions.share).toHaveBeenLastCalledWith('b-photo', ['wv-els']))
  })

  it('puts the tick back and says why when a save is refused', async () => {
    boardActions.share.mockResolvedValue({ ok: false, error: 'notFound' })
    view(TILES, boardsOn(PHOTO.id))
    open()
    const els = screen.getByRole('checkbox', { name: /Bloemen Els/ })
    fireEvent.click(els)
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
    expect(els).not.toBeChecked()
  })

  it('stores the couple flag separately', async () => {
    view(TILES, boardsOn(PHOTO.id))
    open()
    const couple = screen.getByRole('checkbox', { name: /^Couple/ })
    expect(couple).toBeChecked()
    fireEvent.click(couple)
    await waitFor(() => expect(boardActions.shareCouple).toHaveBeenCalledWith('b-photo', false))
  })

  it('marks a vendor with no link', () => {
    view(TILES, boardsOn(PHOTO.id))
    open()
    expect(screen.getByText('Photography')).toBeInTheDocument()
    expect(screen.getByText('Flowers · no link yet')).toBeInTheDocument()
  })

  it('says nothing about links when the caller cannot see them (a member)', () => {
    const boards = boardsOn(PHOTO.id)
    view(TILES, { ...boards, vendors: boards.vendors.map((v) => ({ ...v, hasLink: null })) })
    open()
    expect(screen.getByText('Flowers')).toBeInTheDocument()
    expect(screen.queryByText(/no link yet/)).toBeNull()
  })
})
