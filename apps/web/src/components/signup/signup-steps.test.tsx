import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  preview: 'PREVIEW',
  previewFallback: 'FALLBACK',
  create: 'CREATE',
  creating: 'CREATING',
  continue: 'CONTINUE',
  errors: { required: 'E-REQ', tooLong: 'E-LONG', failed: 'E-FAILED', forbidden: 'E-FORBIDDEN' },
  logo: {
    label: 'L-LOGO',
    upload: 'UPLOAD',
    replace: 'REPLACE',
    remove: 'REMOVE',
    uploading: 'UPLOADING',
    removing: 'REMOVING',
    help: 'HELP',
    added: 'ADDED',
    removed: 'REMOVED',
    errors: { notImage: 'E-NOT-IMAGE', tooLarge: 'E-TOO-LARGE', failed: 'E-LOGO-FAILED' },
    afterCreate: 'E-AFTER-CREATE',
  },
}

const noLogo = { start: vi.fn(), confirm: vi.fn() }

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
  emailLabels: ['EMAIL 1', 'EMAIL 2', 'EMAIL 3'],
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
    render(<StudioStep labels={STUDIO} ownerName="" action={action} logoActions={noLogo} />)
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
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={vi.fn()} logoActions={noLogo} />)
    expect(screen.getByLabelText('L-OWNER')).toHaveValue('Ilse')
  })

  it('posts both names, and shows a refusal without losing them', async () => {
    const action = vi.fn(async () => ({ form: 'failed' as const }))
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={action} logoActions={noLogo} />)
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

  it('posts no logo flag when no logo was picked, so the action redirects as before', async () => {
    const action = vi.fn(async () => ({}))
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={action} logoActions={noLogo} />)
    fireEvent.change(screen.getByLabelText('L-NAME'), { target: { value: 'Studio Wit' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'CREATE' }))
    })
    const fd = (action.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(fd.get('logo')).toBe('')
  })
})

/**
 * The logo on the Studio step (spec 0005, as built): held in the browser until the studio
 * exists, then uploaded, then the form is posted again. jsdom has no object URLs, so
 * `createObjectURL` is stubbed; `fetch` is the PUT.
 */
describe('StudioStep logo', () => {
  const png = (bytes = 4) => new File([new Uint8Array(bytes)], 'logo.png', { type: 'image/png' })
  const pick = (file: File) =>
    act(async () => {
      fireEvent.change(screen.getByTestId('logo-input'), { target: { files: [file] } })
    })

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:held')
    URL.revokeObjectURL = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['an SVG', new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), 'E-NOT-IMAGE'],
    [
      'a file over 2 MB',
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }),
      'E-TOO-LARGE',
    ],
  ])('refuses %s beside the field, and holds nothing', async (_label, file, message) => {
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={vi.fn()} logoActions={noLogo} />)
    await pick(file)
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByTestId('logo-tile')).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('shows a held logo in the tile and the preview, and announces it', async () => {
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={vi.fn()} logoActions={noLogo} />)
    await pick(png())
    expect(screen.getByTestId('logo-tile')).toHaveAttribute('src', 'blob:held')
    expect(screen.getByTestId('studio-logo')).toHaveAttribute('src', 'blob:held')
    expect(screen.getByRole('button', { name: 'REPLACE' })).toBeInTheDocument()
    expect(screen.getByText('ADDED')).toBeInTheDocument()
    // Nothing leaves the browser before the studio exists.
    expect(noLogo.start).not.toHaveBeenCalled()
  })

  it('uploads after the studio is created, then posts again to move on', async () => {
    const action = vi.fn().mockResolvedValueOnce({ created: true }).mockResolvedValueOnce({})
    const logo = {
      start: vi.fn(async () => ({ ok: true as const, fileId: 'f1', url: '/put', headers: {} })),
      confirm: vi.fn(async () => ({ ok: true as const })),
    }
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={action} logoActions={logo} />)
    fireEvent.change(screen.getByLabelText('L-NAME'), { target: { value: 'Studio Wit' } })
    await pick(png())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'CREATE' }))
    })

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const first = (action.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(first.get('logo')).toBe('1')
    expect(logo.start).toHaveBeenCalledWith({ mime: 'image/png', sizeBytes: 4 })
    expect(fetch).toHaveBeenCalledWith('/put', expect.objectContaining({ method: 'PUT' }))
    expect(logo.confirm).toHaveBeenCalledWith('f1')
  })

  it('leaves the button usable when the second post is refused after a good upload', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ form: 'forbidden' })
    const logo = {
      start: vi.fn(async () => ({ ok: true as const, fileId: 'f1', url: '/put', headers: {} })),
      confirm: vi.fn(async () => ({ ok: true as const })),
    }
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={action} logoActions={logo} />)
    fireEvent.change(screen.getByLabelText('L-NAME'), { target: { value: 'Studio Wit' } })
    await pick(png())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'CREATE' }))
    })
    await waitFor(() => expect(screen.getByText('E-FORBIDDEN')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeEnabled()
  })

  it('stays when the upload fails after creating, says so, and Continue posts without a logo', async () => {
    const action = vi.fn().mockResolvedValueOnce({ created: true }).mockResolvedValue({})
    const logo = {
      start: vi.fn(async () => ({ ok: false as const, error: 'unavailable' as const })),
      confirm: vi.fn(),
    }
    render(<StudioStep labels={STUDIO} ownerName="Ilse" action={action} logoActions={logo} />)
    fireEvent.change(screen.getByLabelText('L-NAME'), { target: { value: 'Studio Wit' } })
    await pick(png())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'CREATE' }))
    })

    await waitFor(() => expect(screen.getByText('E-AFTER-CREATE')).toBeInTheDocument())
    expect(action).toHaveBeenCalledTimes(1)
    // The preview no longer shows a logo that never arrived.
    expect(screen.queryByTestId('studio-logo')).toBeNull()
    expect(logo.confirm).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    })
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const second = (action.mock.calls[1] as unknown as [unknown, FormData])[1]
    expect(second.get('logo')).toBe('')
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
