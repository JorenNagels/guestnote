import type { VendorRow } from '@guestnote/db'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import copy from '../../../messages/app/vendors.en.json'
import { TOAST_LABELS } from '../toast/fixtures.ts'
import { ToastProvider } from '../toast/toast-provider.tsx'
import { DirectoryView } from './directory-view.tsx'
import { directoryLabels } from './labels.ts'

const archive = vi.fn()
const restore = vi.fn()
vi.mock('../../app/pro/(app)/vendors/actions.ts', () => ({
  createDirectoryVendor: vi.fn(),
  updateDirectoryVendor: vi.fn(),
  archiveDirectoryVendor: (...a: unknown[]) => archive(...a),
  restoreDirectoryVendor: (...a: unknown[]) => restore(...a),
}))

/**
 * Spec 0009 C4 on the studio directory: Archive acts at once, the edit sheet closes, and the
 * toast offers Undo, which calls the restore with the same vendor. Labels come from the real
 * English catalogue through the real `directoryLabels`, so a key missing there fails here.
 */
const lookup = (catalogue: Record<string, unknown>) => {
  const get = (key: string) =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], catalogue)
  const t = (key: string) => String(get(key))
  t.raw = get
  return t
}

const VENDOR: VendorRow = {
  id: 'v1',
  name: 'Bloemen Els',
  category: 'Flowers',
  email: null,
  phone: null,
  notes: null,
}

const view = (vendor: VendorRow = VENDOR) =>
  render(
    <ToastProvider labels={TOAST_LABELS}>
      <DirectoryView vendors={[vendor]} canWrite labels={directoryLabels(lookup(copy))} />
    </ToastProvider>,
  )

const toast = () => within(screen.getByTestId('toast')).getByRole('status')

beforeEach(() => {
  archive.mockReset().mockResolvedValue({ ok: true })
  restore.mockReset().mockResolvedValue({ ok: true })
})

describe('archiving a directory vendor', () => {
  it('archives at once, closes the sheet, and offers Undo by name', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloemen Els' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(archive).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast()).toHaveTextContent('“Bloemen Els” archived.')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(toast()).toHaveTextContent('Restored.'))
  })

  // `String.replace` reads `$&` in a replacement STRING as "the match", so this name used to come
  // out as "Bloem {name} Co".
  it('puts a name holding a replacement pattern into the toast as written', async () => {
    view({ ...VENDOR, name: 'Bloem $& Co' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloem $& Co' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(toast()).toHaveTextContent('“Bloem $& Co” archived.'))
  })

  it('keeps the sheet open, with no toast, when the archive is refused', async () => {
    archive.mockResolvedValue({ ok: false, error: 'forbidden' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloemen Els' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.forbidden)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast()).toBeEmptyDOMElement()
  })

  it("says the undo was refused in the directory's words", async () => {
    restore.mockResolvedValue({ ok: false, error: 'forbidden' })
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bloemen Els' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(toast()).toHaveTextContent(copy.errors.forbidden))
  })
})
