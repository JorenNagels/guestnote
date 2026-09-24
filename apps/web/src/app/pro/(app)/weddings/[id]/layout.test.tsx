import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The wedding layout: the header and tab strip every wedding screen shares (2026-09-24). What it
 * decides is whether to render them at all -- the same 404 rule as the pages below it, because a
 * header naming a couple is itself the leak research/07 section 3 forbids. `WeddingHeader` and
 * `WeddingTabs` are async Server Components jsdom cannot render as children, so they are stubbed
 * and have their own tests.
 */
const getWeddingDetail = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  getWeddingDetail: (...a: unknown[]) => getWeddingDetail(...a),
}))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../../lib/principal.ts', () => ({
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('../../../../../components/wedding/wedding-header.tsx', () => ({
  WeddingHeader: ({ wedding }: { wedding: { coupleDisplayName: string } }) => (
    <h1>{wedding.coupleDisplayName}</h1>
  ),
}))
vi.mock('../../../../../components/wedding/wedding-tabs.tsx', () => ({
  WeddingTabs: ({ weddingId }: { weddingId: string }) => <nav data-wedding={weddingId} />,
}))

const WeddingLayout = (await import('./layout.tsx')).default

const WID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const MEMBERSHIPS = { userId: 'u1', orgs: [{ orgId: 'org-a', role: 'owner' }], weddings: [] }

const renderLayout = async (id = WID) =>
  render(await WeddingLayout({ params: Promise.resolve({ id }), children: <p>tab content</p> }))

beforeEach(() => {
  vi.clearAllMocks()
  currentMemberships.mockResolvedValue(MEMBERSHIPS)
  currentOrgId.mockResolvedValue('org-a')
  getWeddingDetail.mockResolvedValue({ coupleDisplayName: 'Els & Jan' })
})

describe('the wedding layout', () => {
  it('renders the couple, the strip for this wedding, and the tab below them', async () => {
    const { container } = await renderLayout()
    expect(screen.getByRole('heading', { level: 1, name: 'Els & Jan' })).toBeInTheDocument()
    expect(container.querySelector('nav')?.getAttribute('data-wedding')).toBe(WID)
    expect(screen.getByText('tab content')).toBeInTheDocument()
  })

  it('is a 404 when the principal may not see the wedding, and names nobody', async () => {
    getWeddingDetail.mockResolvedValue(null)
    await expect(renderLayout()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('is a 404 for a malformed id, before any query', async () => {
    await expect(renderLayout('not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getWeddingDetail).not.toHaveBeenCalled()
  })

  it('is a 404 with no memberships or no org', async () => {
    currentMemberships.mockResolvedValue(null)
    await expect(renderLayout()).rejects.toThrow('NEXT_NOT_FOUND')
    currentMemberships.mockResolvedValue(MEMBERSHIPS)
    currentOrgId.mockResolvedValue(null)
    await expect(renderLayout()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
