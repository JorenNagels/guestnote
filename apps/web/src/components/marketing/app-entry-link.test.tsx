import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppEntryLink } from './app-entry-link.tsx'

/**
 * The one dynamic control on an otherwise static, CDN-cached page.
 *
 * Every assertion here is about a failure that is invisible from the outside. The label not
 * updating looks like nothing happening; the label updating when it should not sends a
 * visitor to a dashboard they cannot see. So the negative cases outnumber the positive one,
 * deliberately.
 */
const PROPS = {
  hintUrl: 'http://app.guestnote.localhost:3000/api/session-hint',
  loginHref: 'http://app.guestnote.localhost:3000/login',
  loginLabel: 'Inloggen',
  dashboardHref: 'http://app.guestnote.localhost:3000/',
  dashboardLabel: 'Dashboard',
}

const fetchMock = vi.fn()

beforeEach(() => {
  // `mockReset` and not `clearAllMocks`: the implementation has to go too, or a test that
  // installed a never-resolving `mockImplementation` leaks it into the next one. Reset first,
  // then install the default, because reset also removes that.
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ signedIn: false }) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const link = () => screen.getByRole('link')
const dashboard = () => screen.findByRole('link', { name: 'Dashboard' })

describe('before the probe answers', () => {
  it('renders the login label, which is right for almost every apex visitor', () => {
    // Not a skeleton and not empty. This is what lands in the prerendered HTML, so it has to
    // be correct with no JavaScript at all -- and for a prospect it is.
    render(<AppEntryLink {...PROPS} />)
    expect(link()).toHaveTextContent('Inloggen')
    expect(link()).toHaveAttribute('href', PROPS.loginHref)
  })
})

describe('when the visitor is signed in', () => {
  it('swaps to the dashboard label and href', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ signedIn: true }) })
    render(<AppEntryLink {...PROPS} />)

    expect(await dashboard()).toHaveAttribute('href', PROPS.dashboardHref)
  })

  it('sends the cookie, without which the answer is always false', async () => {
    // `credentials: 'include'` is the entire request. Apex and app host are same-site, but a
    // cross-ORIGIN fetch still omits cookies by default.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ signedIn: true }) })
    render(<AppEntryLink {...PROPS} />)
    await dashboard()

    expect(fetchMock).toHaveBeenCalledWith(
      PROPS.hintUrl,
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('sends no request headers, so the request stays preflight-free', async () => {
    // The trap named at the bottom of app/api/session-hint/route.ts: one header turns this
    // into a preflighted request, the browser sends OPTIONS, the route answers 405, and the
    // label silently stops working. This assertion is what makes that regression loud.
    render(<AppEntryLink {...PROPS} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const init = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(init.headers).toBeUndefined()
    expect(init.method ?? 'GET').toBe('GET')
  })
})

describe('every way it can fail leaves the login label alone', () => {
  it.each([
    ['a false answer', { ok: true, json: async () => ({ signedIn: false }) }],
    ['a 500', { ok: false, status: 500, json: async () => ({ signedIn: true }) }],
    ['a 404 from a moved route', { ok: false, status: 404, json: async () => ({}) }],
    ['an empty body', { ok: true, json: async () => ({}) }],
    ['null', { ok: true, json: async () => null }],
    ['an array', { ok: true, json: async () => [] }],
    ['a truthy non-boolean', { ok: true, json: async () => ({ signedIn: 'no' }) }],
    ['the number 1', { ok: true, json: async () => ({ signedIn: 1 }) }],
  ])('holds on %s', async (_name, response) => {
    // `signedIn === true` and nothing looser. A truthiness test would flip the label on the
    // string 'no', which is exactly the kind of thing a future endpoint change could send.
    fetchMock.mockResolvedValue(response)
    render(<AppEntryLink {...PROPS} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await Promise.resolve()
    expect(link()).toHaveTextContent('Inloggen')
    expect(link()).toHaveAttribute('href', PROPS.loginHref)
  })

  it('holds when the network rejects -- offline, or CORS refused', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AppEntryLink {...PROPS} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(link()).toHaveTextContent('Inloggen')
  })

  it('holds when the body is not json at all', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })
    render(<AppEntryLink {...PROPS} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(link()).toHaveTextContent('Inloggen')
  })
})

describe('lifecycle', () => {
  it('aborts the probe on unmount rather than setting state on a dead component', async () => {
    const signals: AbortSignal[] = []
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      signals.push(init.signal)
      return new Promise(() => {})
    })

    const { unmount } = render(<AppEntryLink {...PROPS} />)
    await waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0]?.aborted).toBe(false)

    unmount()
    expect(signals[0]?.aborted).toBe(true)
  })

  it('asks once, not once per render', async () => {
    const { rerender } = render(<AppEntryLink {...PROPS} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    rerender(<AppEntryLink {...PROPS} />)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
