import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import shellNl from '../../../../messages/app/shell.nl.json'
import { useToast } from '../../../components/toast/toast-provider.tsx'

/**
 * The app layout, for the one thing spec 0009 C4 added to it: the `ToastProvider` around the
 * pages. Every screen that deletes calls `useToast().show`, and outside a provider that is a
 * silent no-op by design (`toast-provider.tsx`), so a layout that stopped mounting it would
 * break every Undo with no test anywhere failing -- the component tests all wrap themselves.
 *
 * `Shell` is stubbed to its children (it has its own tests), and so is everything the layout
 * reads. The toast words come from the REAL Dutch shell catalogue, so a key the layout asks for
 * under the wrong name reads as the key here, not as the sentence.
 */
const currentOrgId = vi.fn()
const currentOrgs = vi.fn()
const currentMemberships = vi.fn()

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => {
  const lookup = (catalogue: unknown, key: string) =>
    key
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalogue)
  return {
    getLocale: async () => 'nl',
    getTranslations: async (ns: string) => {
      const t = (key: string) => {
        const hit = ns === 'app.shell' ? lookup(shellNl, key) : undefined
        return typeof hit === 'string' ? hit : `${ns}.${key}`
      }
      t.raw = t
      return t
    },
  }
})
vi.mock('../../../lib/auth.ts', () => ({
  getAuth: () => ({
    getSession: async () => ({ name: 'Els', email: 'els@example.be' }),
    hasPasskey: async () => true,
    passkeysAvailable: () => false,
  }),
}))
vi.mock('../../../lib/principal.ts', () => ({
  currentOrgId: () => currentOrgId(),
  currentOrgs: () => currentOrgs(),
  currentMemberships: () => currentMemberships(),
}))
vi.mock('@guestnote/db', () => ({
  listWeddings: async () => [],
  studioSettings: async () => null,
  principalForOrg: () => ({ kind: 'orgStaff' }),
}))
vi.mock('../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../lib/trial.ts', () => ({ orgTrialState: async () => ({ kind: 'off' }) }))
vi.mock('../../../lib/billing-mode.ts', () => ({ billingMode: () => ({ on: false }) }))
vi.mock('../../../lib/observability.ts', () => ({ feedbackAvailable: () => false }))
vi.mock('../../../lib/studio-logo.ts', () => ({ logoUrl: async () => null }))
vi.mock('../../../lib/app-url.ts', () => ({ apexOrigin: () => 'https://guestnote.localhost' }))
vi.mock('../../../components/nav/shell.tsx', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

const AppShellLayout = (await import('./layout.tsx')).default

/** Stands in for any screen that deletes something: it raises a toast with an Undo. */
function Deleter() {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() => toast.show({ message: 'x', undo: async () => 'restored' })}
    >
      delete
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  currentOrgId.mockResolvedValue('org-a')
  currentOrgs.mockResolvedValue([{ id: 'org-a', name: 'Studio A', role: 'owner' }])
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: 'org-a', role: 'owner' }],
    weddings: [],
  })
})

describe('the app layout', () => {
  it("mounts the toast provider around the pages, in the shell catalogue's words", async () => {
    render(await AppShellLayout({ children: <Deleter /> }))
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))

    const card = screen.getByTestId('toast')
    expect(within(card).getByRole('status')).toHaveTextContent(/^x$/)
    expect(within(card).getByRole('button', { name: shellNl.toast.undo })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: shellNl.toast.dismiss })).toBeInTheDocument()
  })
})
