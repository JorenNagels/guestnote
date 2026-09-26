import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogoField, type LogoFieldLabels } from './logo-field.tsx'
import type { LogoResult } from './logo-upload.ts'

/**
 * The logo block's four states -- none, working, set, refused -- and what it announces. The
 * callbacks are fakes: where a logo goes is the caller's business (`studio-logo.tsx`, sign-up's
 * `studio-step.tsx`), and this component only draws and reports.
 */
const LABELS: LogoFieldLabels = {
  label: 'Logo · optional',
  upload: 'Upload logo',
  replace: 'Replace',
  remove: 'Remove',
  uploading: 'Uploading…',
  removing: 'Removing…',
  help: 'HELP',
  added: 'Logo added',
  removed: 'Logo removed',
  errors: { notImage: 'E-NOT-IMAGE', tooLarge: 'E-TOO-LARGE', failed: 'E-FAILED' },
}

const png = () => new File([new Uint8Array(4)], 'logo.png', { type: 'image/png' })
const live = () => document.querySelector('[aria-live="polite"]')

function setup(url: string | null, over: Partial<Parameters<typeof LogoField>[0]> = {}) {
  const onPick = vi.fn(async (): Promise<LogoResult> => ({ ok: true }))
  const onRemove = vi.fn(async (): Promise<LogoResult> => ({ ok: true }))
  const view = render(
    <LogoField id="t" labels={LABELS} url={url} onPick={onPick} onRemove={onRemove} {...over} />,
  )
  return { onPick, onRemove, ...view }
}

const pick = (file: File) =>
  act(async () => {
    fireEvent.change(screen.getByTestId('logo-input'), { target: { files: [file] } })
  })

describe('LogoField', () => {
  it('with no logo: a placeholder tile, Upload, no Remove, the help text', () => {
    setup(null)
    expect(screen.getByRole('group', { name: 'Logo · optional' })).toBeInTheDocument()
    expect(screen.getByTestId('logo-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('logo-tile')).toBeNull()
    expect(screen.getByRole('button', { name: 'Upload logo' })).toHaveAccessibleDescription('HELP')
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('accepts only the three raster types in the picker', () => {
    setup(null)
    expect(screen.getByTestId('logo-input')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    )
  })

  it('with a logo: the image, Replace and Remove', () => {
    setup('https://get.example/logo')
    expect(screen.getByTestId('logo-tile')).toHaveAttribute('src', 'https://get.example/logo')
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('shows Uploading while the pick is in flight, then announces the logo', async () => {
    let finish: (r: LogoResult) => void = () => {}
    const onPick = vi.fn(() => new Promise<LogoResult>((r) => (finish = r)))
    setup(null, { onPick })
    const file = png()
    await pick(file)

    expect(onPick).toHaveBeenCalledWith(file)
    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
    expect(live()).toHaveTextContent('')

    await act(async () => finish({ ok: true }))
    expect(live()).toHaveTextContent('Logo added')
    expect(screen.getByRole('button', { name: 'Upload logo' })).toBeEnabled()
  })

  it.each([
    ['notImage', 'E-NOT-IMAGE'],
    ['tooLarge', 'E-TOO-LARGE'],
    ['failed', 'E-FAILED'],
  ] as const)('shows the %s refusal as an alert, and announces nothing', async (error, text) => {
    setup(null, { onPick: vi.fn(async () => ({ ok: false as const, error })) })
    await pick(png())
    expect(screen.getByRole('alert')).toHaveTextContent(text)
    expect(live()).toHaveTextContent('')
    // The button now points at the error too, so it is read with the control.
    expect(screen.getByRole('button', { name: 'Upload logo' })).toHaveAccessibleDescription(
      `HELP ${text}`,
    )
  })

  it('clears a refusal when the next pick starts', async () => {
    const onPick = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'tooLarge' })
      .mockResolvedValueOnce({ ok: true })
    setup(null, { onPick })
    await pick(png())
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await pick(png())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('removes, then announces it', async () => {
    const { onRemove } = setup('https://get.example/logo')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    })
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(live()).toHaveTextContent('Logo removed')
  })

  it('shows a failed remove as an alert', async () => {
    setup('https://get.example/logo', {
      onRemove: vi.fn(async () => ({ ok: false as const, error: 'failed' as const })),
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('E-FAILED')
  })

  it('falls back to the placeholder when the image fails to load', () => {
    setup('https://get.example/gone')
    fireEvent.error(screen.getByTestId('logo-tile'))
    expect(screen.queryByTestId('logo-tile')).toBeNull()
    expect(screen.getByTestId('logo-placeholder')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload logo' })).toBeInTheDocument()
  })
})
