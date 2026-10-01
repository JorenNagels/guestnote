import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InviteCard, type InviteCardCopy } from './invite-card.tsx'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const COPY: InviteCardCopy = {
  title: 'INVITE',
  body: 'BODY',
  partner1: 'P1',
  partner2: 'P2',
  sharedCount: 'THEY SEE 3',
  send: 'SEND',
  sending: 'SENDING',
  sent: 'SENT',
  resend: 'RESEND',
  invitedOn: 'ON {date}',
  expired: 'EXPIRED',
  mailFailed: 'MAIL-FAILED',
  errEmail: 'E-EMAIL',
  errSame: 'E-SAME',
  errStaff: 'E-STAFF {email}',
  errExists: 'E-EXISTS {email}',
  errPartner: 'E-PARTNER {email}',
  errForbidden: 'E-FORBIDDEN',
  errFull: 'E-FULL',
  errGeneric: 'E-GENERIC',
}

const card = (over: Partial<Parameters<typeof InviteCard>[0]> = {}) =>
  render(
    <InviteCard
      copy={COPY}
      tasksHref="/weddings/w/tasks"
      pending={[]}
      invite={vi.fn()}
      resend={vi.fn()}
      {...over}
    />,
  )

describe('InviteCard (spec 0008)', () => {
  it('says how many shared tasks the couple will see, linked to the list, before the button', () => {
    card()
    expect(screen.getByRole('link', { name: 'THEY SEE 3' })).toHaveAttribute(
      'href',
      '/weddings/w/tasks',
    )
  })

  it('sends both fields, and places each refusal under the field it came from', async () => {
    const invite = vi.fn().mockResolvedValue({
      ok: true,
      results: [
        { email: 'a@x.be', ok: true },
        { email: 'b@x.be', ok: false, reason: 'alreadyStaff' },
      ],
    })
    const user = userEvent.setup()
    card({ invite })
    await user.type(screen.getByLabelText('P1'), 'a@x.be')
    await user.type(screen.getByLabelText('P2'), 'b@x.be')
    await user.click(screen.getByRole('button', { name: 'SEND' }))

    expect(invite).toHaveBeenCalledWith(['a@x.be', 'b@x.be'])
    expect(await screen.findByText('E-STAFF b@x.be')).toBeInTheDocument()
    expect(screen.getByLabelText('P1')).toHaveValue('')
    expect(screen.getByLabelText('P2')).toHaveValue('b@x.be')
    expect(screen.getByLabelText('P2')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('P1')).not.toHaveAttribute('aria-invalid')
  })

  it('a failed mail says so and clears the field: the invite exists and is listed to resend', async () => {
    const invite = vi.fn().mockResolvedValue({
      ok: true,
      results: [{ email: 'a@x.be', ok: false, reason: 'mailFailed' }],
    })
    const user = userEvent.setup()
    card({ invite })
    await user.type(screen.getByLabelText('P1'), 'a@x.be')
    await user.click(screen.getByRole('button', { name: 'SEND' }))
    expect(await screen.findByText('MAIL-FAILED')).toBeInTheDocument()
    expect(screen.getByLabelText('P1')).toHaveValue('')
  })

  it('marks the second field when it is the second address that is not one', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: false, reason: 'invalidEmail', index: 1 })
    const user = userEvent.setup()
    card({ invite })
    await user.type(screen.getByLabelText('P1'), 'a@x.be')
    await user.type(screen.getByLabelText('P2'), 'tom@')
    await user.click(screen.getByRole('button', { name: 'SEND' }))
    expect(await screen.findByText('E-EMAIL')).toBeInTheDocument()
    expect(screen.getByLabelText('P2')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('P1')).not.toHaveAttribute('aria-invalid')
  })

  it('offers only the free slots: one field for one, no form for none', () => {
    const { unmount } = card({ slots: 1 })
    expect(screen.getByLabelText('P1')).toBeInTheDocument()
    expect(screen.queryByLabelText('P2')).toBeNull()
    unmount()
    card({ slots: 0 })
    expect(screen.queryByRole('button', { name: 'SEND' })).toBeNull()
  })

  it('stops the resend spinner and says so when the resend throws', async () => {
    const resend = vi.fn().mockRejectedValue(new Error('trial ended'))
    const user = userEvent.setup()
    card({ resend, pending: [{ id: 'i1', email: 'a@x.be', sentOn: '1 okt', expired: false }] })
    await user.click(screen.getByRole('button', { name: 'RESEND' }))
    expect(await screen.findByText('E-GENERIC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'RESEND' })).toBeEnabled()
  })

  it('puts a whole-form refusal under the first field', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: false, reason: 'sameEmail' })
    const user = userEvent.setup()
    card({ invite })
    await user.type(screen.getByLabelText('P1'), 'a@x.be')
    await user.click(screen.getByRole('button', { name: 'SEND' }))
    expect(await screen.findByText('E-SAME')).toBeInTheDocument()
  })

  it('lists pending invites with their date or EXPIRED, and resends by id', async () => {
    const resend = vi.fn().mockResolvedValue({ email: 'a@x.be', ok: true })
    const user = userEvent.setup()
    card({
      resend,
      pending: [
        { id: 'i1', email: 'a@x.be', sentOn: '1 okt', expired: false },
        { id: 'i2', email: 'b@x.be', sentOn: '1 sep', expired: true },
      ],
    })
    expect(screen.getByText('ON 1 okt')).toBeInTheDocument()
    expect(screen.getByText('EXPIRED')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'RESEND' })[1] as HTMLElement)
    expect(resend).toHaveBeenCalledWith('i2')
  })
})
