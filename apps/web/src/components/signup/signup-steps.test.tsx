import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvitedLabels } from './invited-step.tsx'
import type { StudioLabels } from './studio-step.tsx'
import type { TeamLabels } from './team-step.tsx'
import type { WeddingLabels } from './wedding-step.tsx'

/**
 * Sign-up's step components. Only the Server Functions are replaced -- each step takes its
 * action as a prop, so a `vi.fn` stands in -- and `../auth/actions.ts`, which the frame's
 * locale switcher imports and which would otherwise pull the server into jsdom.
 */
vi.mock('../auth/actions.ts', () => ({ setLocale: vi.fn() }))

const { StudioStep } = await import('./studio-step.tsx')
const { WeddingStep } = await import('./wedding-step.tsx')
const { TeamStep } = await import('./team-step.tsx')
const { InvitedStep } = await import('./invited-step.tsx')
const { ReadyStep } = await import('./ready-step.tsx')

const STUDIO: StudioLabels = {
  title: 'T-STUDIO',
  intro: 'INTRO',
  nameLabel: 'L-NAME',
  namePlaceholder: '',
  ownerLabel: 'L-OWNER',
  ownerPlaceholder: '',
  logoLabel: 'L-LOGO',
  logoLater: 'LOGO-LATER',
  preview: 'PREVIEW',
  previewFallback: 'FALLBACK',
  create: 'CREATE',
  creating: 'CREATING',
  errors: { required: 'E-REQ', tooLong: 'E-LONG', failed: 'E-FAILED', forbidden: 'E-FORBIDDEN' },
}

const WEDDING: WeddingLabels = {
  title: 'T-WEDDING',
  intro: '',
  coupleLabel: 'L-COUPLE',
  couplePlaceholder: '',
  dateLabel: 'L-DATE',
  planLabel: 'L-PLAN',
  tasks: '{count} TASKS',
  empty: 'EMPTY',
  emptyHint: 'EMPTY-HINT',
  create: 'ADD',
  creating: 'ADDING',
  skip: 'SKIP',
  errors: {
    required: 'E-REQ',
    tooLong: 'E-LONG',
    invalidDate: 'E-DATE',
    failed: 'E-FAILED',
    forbidden: 'E-FORBIDDEN',
  },
}

const TEAM: TeamLabels = {
  title: 'T-TEAM',
  intro: '',
  emailLabel: 'EMAIL {n}',
  emailPlaceholder: '',
  note: 'NOTE',
  sendNone: 'SEND-NONE',
  sendOne: 'SEND-ONE',
  sendMany: 'SEND {count}',
  sending: 'SENDING',
  sent: 'SENT',
  skip: 'SKIP',
  errors: {
    invalidEmail: 'E-EMAIL',
    invalidRole: 'E-ROLE',
    duplicate: 'E-DUP',
    alreadyMember: 'E-MEMBER',
    forbidden: 'E-FORBIDDEN',
    mailFailed: 'E-MAIL',
  },
}

const INVITED: InvitedLabels = {
  title: 'T-INVITED',
  intro: 'FOR {email}.',
  staffLine: 'AS {role}',
  weddingLine: 'WEDDING {wedding}',
  invitedBy: 'BY {inviter}',
  roleAdmin: 'ADMIN',
  roleMember: 'MEMBER',
  join: 'JOIN',
  joining: 'JOINING',
  open: 'OPEN',
  couplePortal: 'PORTAL-CLOSED',
  ownStudio: 'OWN-STUDIO',
  errors: { expired: 'E-EXPIRED', accepted: 'E-ACCEPTED', unknown: 'E-UNKNOWN' },
}

beforeEach(() => vi.clearAllMocks())

describe('StudioStep', () => {
  it('keeps Create disabled until both names are non-blank, and previews the name', () => {
    const action = vi.fn(async () => ({}))
    render(<StudioStep labels={STUDIO} ownerName="" action={action} />)
    const create = screen.getByRole('button', { name: 'CREATE' })
    expect(create).toBeDisabled()
    // Before a name: the fallback, never an empty preview row.
    expect(screen.getAllByText('FALLBACK').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('L-NAME'), { target: { value: 'Studio Wit' } })
    expect(create).toBeDisabled()
    fireEvent.change(screen.getByLabelText('L-OWNER'), { target: { value: '   ' } })
    expect(create).toBeDisabled()
    fireEvent.change(screen.getByLabelText('L-OWNER'), { target: { value: 'Ilse' } })
    expect(create).toBeEnabled()
    expect(screen.getByText('Studio Wit')).toBeInTheDocument()
  })

  it('prefills the name already on the account', () => {
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={vi.fn()} />)
    expect(screen.getByLabelText('L-OWNER')).toHaveValue('Ilse')
  })

  it('posts both names, and shows a refusal without losing them', async () => {
    const action = vi.fn(async () => ({ form: 'failed' as const }))
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={action} />)
    fireEvent.change(screen.getByLabelText('L-NAME'), { target: { value: 'Studio Wit' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'CREATE' }))
    })
    await waitFor(() => expect(screen.getByText('E-FAILED')).toBeInTheDocument())
    const fd = (action.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(fd.get('name')).toBe('Studio Wit')
    expect(fd.get('ownerName')).toBe('Ilse')
    expect(screen.getByLabelText('L-NAME')).toHaveValue('Studio Wit')
  })

  it('uploads nothing: the logo is a marked slot until slice 4', () => {
    render(<StudioStep labels={STUDIO} ownerName="" action={vi.fn()} />)
    expect(screen.getByText('LOGO-LATER')).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})

describe('WeddingStep', () => {
  const plans = [
    { id: 'full', name: 'FULL', itemCount: 28 },
    { id: 'day', name: 'DAY', itemCount: 12 },
  ]

  it('offers the plans plus Start empty, the first chosen by default', () => {
    render(<WeddingStep labels={WEDDING} plans={plans} skipHref="/skip" action={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /FULL/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /EMPTY/ })).not.toBeChecked()
    expect(screen.getByText('28 TASKS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SKIP' })).toHaveAttribute('href', '/skip')
  })

  it('defaults to Start empty when the studio has no plans', () => {
    render(<WeddingStep labels={WEDDING} plans={[]} skipHref="/skip" action={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /EMPTY/ })).toBeChecked()
  })

  it('posts the couple and the chosen plan, blank for Start empty', async () => {
    const action = vi.fn(async () => ({ errors: { weddingDate: 'invalidDate' as const } }))
    render(<WeddingStep labels={WEDDING} plans={plans} skipHref="/skip" action={action} />)
    fireEvent.change(screen.getByLabelText('L-COUPLE'), { target: { value: 'Els & Jan' } })
    fireEvent.click(screen.getByRole('radio', { name: /EMPTY/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ADD' }))
    })
    await waitFor(() => expect(screen.getByText('E-DATE')).toBeInTheDocument())
    const fd = (action.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(fd.get('coupleDisplayName')).toBe('Els & Jan')
    expect(fd.get('template')).toBe('')
  })
})

describe('TeamStep', () => {
  const type = (n: number, value: string) =>
    fireEvent.change(screen.getByLabelText(`EMAIL ${n}`), { target: { value } })

  it('counts the filled rows on the button', () => {
    render(<TeamStep labels={TEAM} skipHref="/ready" action={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'SEND-NONE' })).toBeDisabled()
    type(1, 'tom@studio.be')
    expect(screen.getByRole('button', { name: 'SEND-ONE' })).toBeEnabled()
    type(3, 'an@studio.be')
    expect(screen.getByRole('button', { name: 'SEND 2' })).toBeEnabled()
  })

  it('blocks the send on an invalid row, with the error on that row', async () => {
    const action = vi.fn()
    render(<TeamStep labels={TEAM} skipHref="/ready" action={action} />)
    type(1, 'tom@studio.be')
    type(2, 'not an address')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SEND 2' }))
    })
    expect(screen.getByLabelText('EMAIL 2')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('E-EMAIL')).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
  })

  it('locks a row the server already invited and stops counting it', async () => {
    const action = vi.fn(async () => ({ sent: [0], errors: { 1: 'mailFailed' as const } }))
    render(<TeamStep labels={TEAM} skipHref="/ready" action={action} />)
    type(1, 'tom@studio.be')
    type(2, 'an@studio.be')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SEND 2' }))
    })
    await waitFor(() => expect(screen.getByText('E-MAIL')).toBeInTheDocument())
    expect(screen.getByLabelText('EMAIL 1')).toBeDisabled()
    expect(screen.getByText('SENT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SEND-ONE' })).toBeEnabled()
  })
})

describe('InvitedStep', () => {
  const invitations = [
    {
      id: 'i-staff',
      orgName: 'Studio Wit',
      weddingName: null,
      isWedding: false,
      role: 'admin',
      inviterName: 'Ilse',
    },
    {
      id: 'i-wedding',
      orgName: 'Studio Zwart',
      weddingName: 'Els & Jan',
      isWedding: true,
      role: 'couple',
      inviterName: null,
    },
  ]

  it('lists each invitation with Join for staff and Open for a wedding', () => {
    render(
      <InvitedStep
        labels={INVITED}
        email="an@studio.be"
        invitations={invitations}
        ownStudioHref="/own"
        homeHref="/home"
        join={vi.fn()}
      />,
    )
    expect(screen.getByText('AS ADMIN')).toBeInTheDocument()
    expect(screen.getByText('BY Ilse')).toBeInTheDocument()
    expect(screen.getByText('WEDDING Els & Jan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JOIN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OPEN' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OWN-STUDIO' })).toHaveAttribute('href', '/own')
  })

  it('opens a wedding invitation to the portal notice, and accepts nothing', () => {
    const join = vi.fn()
    render(
      <InvitedStep
        labels={INVITED}
        email="an@studio.be"
        invitations={invitations}
        ownStudioHref="/own"
        homeHref="/home"
        join={join}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'OPEN' }))
    expect(screen.getByText('PORTAL-CLOSED')).toBeInTheDocument()
    expect(join).not.toHaveBeenCalled()
  })

  it('joins by id and shows a refusal under that invitation', async () => {
    const join = vi.fn(async () => ({ ok: false as const, reason: 'expired' as const }))
    render(
      <InvitedStep
        labels={INVITED}
        email="an@studio.be"
        invitations={invitations}
        ownStudioHref="/own"
        homeHref="/home"
        join={join}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'JOIN' }))
    })
    expect(join).toHaveBeenCalledWith('i-staff')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('E-EXPIRED'))
  })
})

describe('InvitedStep, joined', () => {
  it('navigates home on a successful join, and shows no error', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      writable: true,
      configurable: true,
    })
    const join = vi.fn(async () => ({ ok: true as const }))
    render(
      <InvitedStep
        labels={INVITED}
        email="an@studio.be"
        invitations={[
          {
            id: 'i-staff',
            orgName: 'Studio Wit',
            weddingName: null,
            isWedding: false,
            role: 'member',
            inviterName: null,
          },
        ]}
        ownStudioHref="/own"
        homeHref="/home"
        join={join}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'JOIN' }))
    })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ReadyStep', () => {
  it('summarises, with a dash for a skipped wedding and no trial line in the demo', () => {
    render(
      <ReadyStep
        labels={{
          title: 'Studio Wit READY',
          studio: 'STUDIO',
          wedding: 'WEDDING',
          team: 'TEAM',
          teamValue: 'JUST-YOU',
          open: 'OPEN-APP',
        }}
        studioName="Studio Wit"
        weddingName={null}
        homeHref="/"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Studio Wit READY' })).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('JUST-YOU')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OPEN-APP' })).toHaveAttribute('href', '/')
  })
})
