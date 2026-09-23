import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PendingInvites, type PendingInvitesCopy, type PendingRow } from './pending-invites.tsx'

const COPY: PendingInvitesCopy = {
  caption: 'Pending invitations',
  email: 'Email',
  role: 'Role',
  status: 'Status',
  revoke: 'Revoke',
  revoking: 'Revoking…',
  revokeFailed: 'Could not revoke.',
  expiredPill: 'Expired',
}

const ROWS: PendingRow[] = [
  {
    id: 'i1',
    email: 'els@studio.be',
    roleLabel: 'Team member',
    statusLabel: 'Sent 2 days ago · expires in 5 days',
    expired: false,
    revokeLabel: 'Revoke the invitation for els@studio.be',
  },
  {
    id: 'i2',
    email: 'old@studio.be',
    roleLabel: 'Admin',
    statusLabel: 'Sent 9 days ago · expires today',
    expired: true,
    revokeLabel: 'Revoke the invitation for old@studio.be',
  },
]

describe('PendingInvites', () => {
  it('lists each invitation with its status, and marks an expired one in words', () => {
    render(<PendingInvites rows={ROWS} copy={COPY} revoke={vi.fn()} />)
    expect(screen.getByText('Sent 2 days ago · expires in 5 days')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    // The expired row shows the word instead of the countdown.
    expect(screen.queryByText('Sent 9 days ago · expires today')).not.toBeInTheDocument()
  })

  it('revokes the row that was clicked, named by its own accessible label', async () => {
    const revoke = vi.fn().mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<PendingInvites rows={ROWS} copy={COPY} revoke={revoke} />)

    await user.click(
      screen.getByRole('button', { name: 'Revoke the invitation for old@studio.be' }),
    )

    expect(revoke).toHaveBeenCalledExactlyOnceWith('i2')
  })

  it('says so under the table when the revoke fails, and keeps the row', async () => {
    const revoke = vi.fn().mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    render(<PendingInvites rows={ROWS} copy={COPY} revoke={revoke} />)

    await user.click(
      screen.getByRole('button', { name: 'Revoke the invitation for els@studio.be' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not revoke.')
    expect(screen.getByText('els@studio.be')).toBeInTheDocument()
  })
})
