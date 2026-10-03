import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOODBOARD_LABELS } from '../../files/fixtures.ts'
import { PortalBoard, type PortalBoardCopy, type PortalTile } from './portal-board.tsx'

/**
 * The couple's board, for what 2026-10-04 added: a document on a shared board is drawn as its type
 * and opens with a URL signed at the tap, as on the planner's board. The comment thread is the
 * planner board's component and is tested there.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const COPY: PortalBoardCopy = {
  empty: 'Empty',
  remove: 'Delete',
  imageUnavailable: 'Image not available',
  open: 'Open {name}',
  openFailed: 'Could not open this file.',
  upload: MOODBOARD_LABELS.upload,
  comments: { none: 'Comment', one: '1 comment', other: '{n} comments' },
  thread: {
    empty: '',
    placeholder: '',
    send: '',
    sending: '',
    remove: '',
    failed: '',
    tooLong: '',
    couple: '',
  },
}

const tile = (over: Partial<PortalTile>): PortalTile => ({
  id: 'i1',
  name: 'Peonies',
  mime: 'image/jpeg',
  url: 'https://get/i1',
  addedBy: null,
  isOwn: false,
  commentCount: 0,
  ...over,
})
const PLAN = tile({ id: 'd1', name: 'Plan.pdf', mime: 'application/pdf', url: null })

const open = vi.fn()
const view = (tiles: PortalTile[]) =>
  render(
    <PortalBoard
      tiles={tiles}
      copy={COPY}
      readOnly={false}
      actions={{
        start: vi.fn(),
        confirm: vi.fn(),
        remove: vi.fn(),
        open,
        thread: vi.fn(),
        comment: vi.fn(),
        removeComment: vi.fn(),
      }}
    />,
  )

let tab: { opener: unknown; location: { href: string }; close: () => void }
beforeEach(() => {
  vi.clearAllMocks()
  open.mockResolvedValue('https://get/plan')
  tab = { opener: window, location: { href: '' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
})

describe('a document on a shared board', () => {
  it('is drawn as its type, beside an image that is still an image', () => {
    view([PLAN, tile({})])
    expect(screen.getByRole('button', { name: 'Open Plan.pdf' })).toHaveTextContent('PDF')
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.queryByText('Image not available')).toBeNull()
  })

  it('opens in a new tab with a URL signed at the tap', async () => {
    view([PLAN])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Plan.pdf' }))
    })
    expect(open).toHaveBeenCalledWith('d1')
    expect(tab.location.href).toBe('https://get/plan')
  })

  it('says so when it could not be opened', async () => {
    open.mockResolvedValue(null)
    view([PLAN])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Plan.pdf' }))
    })
    expect(screen.getByText('Could not open this file.')).toBeInTheDocument()
  })

  it('offers PDF in the picker', () => {
    view([])
    expect(screen.getByTestId('upload-input').getAttribute('accept')).toContain('application/pdf')
  })
})
