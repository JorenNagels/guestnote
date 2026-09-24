import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportLabels } from './report-dialog.tsx'

/**
 * The report dialog. `sendReport` and the canvas shrink are mocked -- jsdom has no canvas, and
 * the server half has its own test -- so this is about what the planner sees: what is sent,
 * the answer for each refusal, and the screenshot's own error beside the picker.
 */
const sendReport = vi.fn()
const shrinkScreenshot = vi.fn()

vi.mock('../../app/pro/(app)/report/actions.ts', () => ({
  sendReport: (...a: unknown[]) => sendReport(...a),
}))
vi.mock('./shrink.ts', () => ({ shrinkScreenshot: (f: File) => shrinkScreenshot(f) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/weddings/abc/budget' }))

const { ReportDialog } = await import('./report-dialog.tsx')

const LABELS: ReportLabels = {
  title: 'Een probleem melden',
  close: 'Sluiten',
  category: 'Soort',
  categories: { bug: 'Fout', idea: 'Idee', question: 'Vraag' },
  message: 'Wat gebeurde er?',
  screenshot: 'Schermafbeelding',
  removeScreenshot: 'Verwijderen',
  send: 'Versturen',
  sending: 'Versturen…',
  sent: 'Bedankt',
  errors: {
    forbidden: 'E-FORBIDDEN',
    empty: 'E-EMPTY',
    tooLong: 'E-TOOLONG',
    badScreenshot: 'E-BADSHOT',
    tooLarge: 'E-TOOLARGE',
    rateLimited: 'E-RATE',
    unavailable: 'E-UNAVAILABLE',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  sendReport.mockResolvedValue({ ok: true })
})

function sentBody(): FormData {
  const body = sendReport.mock.calls[0]?.[0]
  if (!(body instanceof FormData)) throw new Error('sendReport was not called with a FormData')
  return body
}

async function send() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Versturen' }))
  })
}

describe('ReportDialog', () => {
  it('sends the category, the text and the page, then thanks the planner', async () => {
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Idee' }))
    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'Sorteren?' } })
    await send()

    const body = sentBody()
    expect(body.get('category')).toBe('idea')
    expect(body.get('message')).toBe('Sorteren?')
    expect(body.get('page')).toBe('/weddings/abc/budget')
    expect(body.get('screenshot')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Bedankt')
  })

  it.each([
    ['rateLimited', 'E-RATE'],
    ['unavailable', 'E-UNAVAILABLE'],
  ])('shows the %s refusal in its own words and keeps what was typed', async (reason, text) => {
    sendReport.mockResolvedValue({ ok: false, reason })
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'Nog eens' } })
    await send()

    expect(screen.getByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText('Wat gebeurde er?')).toHaveValue('Nog eens')
  })

  it('files a report as a bug unless told otherwise', async () => {
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'x' } })
    await send()
    expect(sentBody().get('category')).toBe('bug')
  })

  it('says too large for a file the browser cannot even decode, and does not attach it', async () => {
    // `createImageBitmap` rejects on HEIC in most browsers -- a real path, not a hypothetical.
    shrinkScreenshot.mockRejectedValue(new Error('decode'))
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    const heic = new File([new Uint8Array(10)], 'a.heic', { type: 'image/heic' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Schermafbeelding'), { target: { files: [heic] } })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('E-TOOLARGE')
  })

  it('removes a picked screenshot, so it is not sent', async () => {
    shrinkScreenshot.mockResolvedValue(new Blob([new Uint8Array([9])], { type: 'image/jpeg' }))
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    const png = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Schermafbeelding'), { target: { files: [png] } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verwijderen' }))
    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'x' } })
    await send()
    expect(sentBody().get('screenshot')).toBeNull()
  })

  it('attaches the shrunk screenshot, not the original', async () => {
    const small = new Blob([new Uint8Array([9])], { type: 'image/jpeg' })
    shrinkScreenshot.mockResolvedValue(small)
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    const original = new File([new Uint8Array(5000)], 'shot.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Schermafbeelding'), { target: { files: [original] } })
    })
    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'x' } })
    await send()

    const shot = sentBody().get('screenshot') as File
    expect(shot.size).toBe(1)
    expect(shot.type).toBe('image/jpeg')
  })

  it('says a screenshot is too large beside the picker, and the report still goes without it', async () => {
    shrinkScreenshot.mockResolvedValue(null)
    render(<ReportDialog open onClose={() => {}} labels={LABELS} />)
    const huge = new File([new Uint8Array(10)], 'huge.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Schermafbeelding'), { target: { files: [huge] } })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('E-TOOLARGE')

    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'x' } })
    await send()
    expect(sentBody().get('screenshot')).toBeNull()
  })
})
