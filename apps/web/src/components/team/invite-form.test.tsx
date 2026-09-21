import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InviteForm, type InviteFormCopy } from './invite-form.tsx'

const COPY: InviteFormCopy = {
  title: 'Invite someone',
  hint: 'A colleague gets an email.',
  email: 'Email address',
  emailPlaceholder: 'colleague@studio.be',
  role: 'Role',
  roleAdmin: 'Admin',
  roleMember: 'Team member',
  roleAdminHint: 'Admins see everything.',
  roleMemberHint: 'Members see assigned weddings.',
  send: 'Send invitation',
  sending: 'Sending…',
  sent: 'Invitation sent to {email}.',
  errors: {
    invalidEmail: 'Not an email address.',
    invalidRole: 'Pick a role.',
    duplicate: 'Already invited.',
    alreadyMember: 'Already a member.',
    forbidden: 'Not allowed.',
    mailFailed: 'Mail failed.',
  },
}

describe('InviteForm', () => {
  it('sends the trimmed address and the chosen role, then confirms and clears the field', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<InviteForm copy={COPY} invite={invite} />)

    await user.type(screen.getByLabelText('Email address'), '  els@studio.be ')
    await user.selectOptions(screen.getByLabelText('Role'), 'admin')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect(invite).toHaveBeenCalledWith({ email: 'els@studio.be', role: 'admin' })
    expect(await screen.findByTestId('invite-sent')).toHaveTextContent(
      'Invitation sent to els@studio.be.',
    )
    expect(screen.getByLabelText('Email address')).toHaveValue('')
  })

  it('defaults to member, the lower privilege', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<InviteForm copy={COPY} invite={invite} />)
    await user.type(screen.getByLabelText('Email address'), 'a@b.be')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(invite).toHaveBeenCalledWith({ email: 'a@b.be', role: 'member' })
    expect(screen.getByText('Members see assigned weddings.')).toBeInTheDocument()
  })

  it('shows the refusal under the field, keeps what was typed and marks the input invalid', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: false, reason: 'duplicate' })
    const user = userEvent.setup()
    render(<InviteForm copy={COPY} invite={invite} />)

    await user.type(screen.getByLabelText('Email address'), 'els@studio.be')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect(await screen.findByText('Already invited.')).toBeInTheDocument()
    const input = screen.getByLabelText('Email address')
    expect(input).toHaveValue('els@studio.be')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('invite-sent')).not.toBeInTheDocument()
  })

  it('clears a previous error when the next send starts', async () => {
    const invite = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'invalidEmail' })
      .mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    render(<InviteForm copy={COPY} invite={invite} />)

    await user.type(screen.getByLabelText('Email address'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Not an email address.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByTestId('invite-sent')).toBeInTheDocument()
    expect(screen.queryByText('Not an email address.')).not.toBeInTheDocument()
  })
})
