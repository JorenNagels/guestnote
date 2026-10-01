import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CoupleSettings, type CoupleSettingsCopy } from './couple-settings.tsx'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const COPY: CoupleSettingsCopy = {
  title: 'COUPLE',
  intro: 'INTRO',
  modulesTitle: 'SEES',
  module: {
    tasks: 'M-TASKS',
    moodboards: 'M-BOARDS',
    run_sheet: 'M-DAY',
    vendors: 'M-VENDORS',
    budget: 'M-BUDGET',
  },
  saved: 'SAVED',
  accessTitle: 'ACCESS',
  noPartners: 'NOBODY',
  pending: 'PENDING',
  expired: 'EXPIRED',
  joinedOn: 'SINCE {date}',
  expiresOn: 'UNTIL {date}',
  resend: 'RESEND',
  revoke: 'REVOKE',
  remove: 'REMOVE',
  cancel: 'CANCEL',
  confirmRemove: 'GONE {email}?',
  confirmRevoke: 'DEAD {email}?',
  sending: 'SENDING',
  sent: 'SENT',
  mailFailed: 'MAIL-FAILED',
  errGeneric: 'E-GENERIC',
}

const actions = () => ({
  setModules: vi.fn().mockResolvedValue({ ok: true }),
  resend: vi.fn().mockResolvedValue({ email: 'x', ok: true }),
  revoke: vi.fn().mockResolvedValue({ ok: true }),
  remove: vi.fn().mockResolvedValue({ ok: true }),
})

describe('CoupleSettings (spec 0008)', () => {
  it('saves the whole set of switches when one flips, and flips it back on failure', async () => {
    const a = actions()
    a.setModules.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false })
    const user = userEvent.setup()
    render(
      <CoupleSettings
        copy={COPY}
        modules={['tasks', 'budget']}
        partners={[]}
        invites={[]}
        actions={a}
      />,
    )
    expect(screen.getByLabelText('M-BUDGET')).toBeChecked()
    await user.click(screen.getByLabelText('M-BUDGET'))
    expect(a.setModules).toHaveBeenLastCalledWith(['tasks'])

    await user.click(screen.getByLabelText('M-DAY'))
    expect(a.setModules).toHaveBeenLastCalledWith(['tasks', 'run_sheet'])
    expect(await screen.findByText('E-GENERIC')).toBeInTheDocument()
    expect(screen.getByLabelText('M-DAY')).not.toBeChecked()
  })

  it('removes a partner only after the confirmation that names them', async () => {
    const a = actions()
    const user = userEvent.setup()
    render(
      <CoupleSettings
        copy={COPY}
        modules={[]}
        partners={[{ userId: 'u1', label: 'Anna', email: 'anna@x.be', since: '1 okt' }]}
        invites={[]}
        actions={a}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'REMOVE' }))
    expect(a.remove).not.toHaveBeenCalled()
    expect(screen.getByText('GONE anna@x.be?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'REMOVE' }))
    expect(a.remove).toHaveBeenCalledWith('u1')
  })

  it('says nobody is invited when there is nobody, and lists an expired invite with resend', async () => {
    const a = actions()
    const user = userEvent.setup()
    const { unmount } = render(
      <CoupleSettings copy={COPY} modules={[]} partners={[]} invites={[]} actions={a} />,
    )
    expect(screen.getByText('NOBODY')).toBeInTheDocument()
    unmount()
    render(
      <CoupleSettings
        copy={COPY}
        modules={[]}
        partners={[]}
        invites={[{ id: 'i1', email: 'b@x.be', expiresOn: '1 nov', expired: true }]}
        actions={a}
      />,
    )
    expect(screen.getByText('EXPIRED')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'RESEND' }))
    expect(a.resend).toHaveBeenCalledWith('i1')
  })
})
