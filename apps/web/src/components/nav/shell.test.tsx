import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellLabels } from './shell.tsx'

/**
 * The dashboard's chrome, rendered for real.
 *
 * ## What is mocked, and why only this much
 *
 * Two things leave the browser and nothing else is replaced: the Server Functions in
 * `(app)/actions.ts` (POST requests here) and `next/navigation`'s router hooks (there is no
 * router in jsdom). `OrgHead`, `AccountMenu`, `Palette`, `Menu`, `NavItem`, `Monogram` and
 * the real `LocaleSwitcher` from `packages/ui` all render. That is deliberate: the
 * assertions below are about what a planner's screen reader and keyboard actually get, and
 * a mocked `Menu` would let the focus return or the `aria-expanded` disappear without one
 * test noticing.
 *
 * ## No fake timers anywhere in this file
 *
 * Testing Library auto-advances fake timers inside `waitFor` only when it detects *Jest's*,
 * via a `jest` global Vitest does not define. Under `vi.useFakeTimers()` every `findBy*` and
 * `waitFor` polls a clock nothing advances and hangs until the suite times out. So the
 * async assertions here await real microtasks, which is all a resolved Server Function
 * mock needs.
 */
const setNavCollapsed = vi.fn()
const switchOrg = vi.fn()
const setTheme = vi.fn()
const setDensity = vi.fn()
const paletteWeddings = vi.fn()
const weddingHeader = vi.fn()
const setLocale = vi.fn()
let pathname = '/weddings'
let params: Record<string, string> = {}

vi.mock('../../app/pro/(app)/actions.ts', () => ({
  setNavCollapsed: (...a: unknown[]) => setNavCollapsed(...a),
  switchOrg: (...a: unknown[]) => switchOrg(...a),
  setTheme: (...a: unknown[]) => setTheme(...a),
  setDensity: (...a: unknown[]) => setDensity(...a),
  paletteWeddings: () => paletteWeddings(),
  weddingHeader: (...a: unknown[]) => weddingHeader(...a),
  signOut: vi.fn(),
}))

vi.mock('../../components/auth/actions.ts', () => ({
  setLocale: (...a: unknown[]) => setLocale(...a),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useParams: () => params,
}))

const { Shell } = await import('./shell.tsx')

const LABELS: ShellLabels = {
  nav: 'Hoofdnavigatie',
  weddings: 'Bruiloften',
  overview: 'Overzicht',
  weddingSection: 'Deze bruiloft',
  collapse: 'Zijbalk inklappen',
  expand: 'Zijbalk uitklappen',
  openMenu: 'Menu openen',
  closeMenu: 'Menu sluiten',
  org: { switch: 'Van organisatie wisselen', current: 'Organisatie' },
  account: {
    account: 'Account',
    language: 'Taal',
    theme: 'Thema',
    themeLight: 'Licht',
    themeDark: 'Donker',
    density: 'Dichtheid',
    densityComfortable: 'Ruim',
    densityCompact: 'Compact',
    signOut: 'Afmelden',
  },
  palette: {
    open: 'Zoeken',
    title: 'Zoek een bruiloft',
    placeholder: 'Zoek een bruiloft',
    weddings: 'Bruiloften',
    empty: 'Niets gevonden.',
    loading: 'Even zoeken…',
    dateUnknown: 'Datum nog niet vastgelegd',
  },
}

const STUDIO_A = { id: 'org-a-id', name: 'Studio A', slug: 'org-a' }
const ATELIER = { id: 'org-c-id', name: 'Atelier Zero', slug: 'org-c' }

function shellTree(over: Partial<Parameters<typeof Shell>[0]> = {}) {
  return (
    <Shell
      org={STUDIO_A}
      orgs={[STUDIO_A]}
      user={{ name: 'Joren Nagels', email: 'joren@example.test' }}
      initialNav="expanded"
      locale="nl"
      theme="light"
      density="comfortable"
      labels={LABELS}
      {...over}
    >
      <p>page body</p>
    </Shell>
  )
}

let rerender: (ui: React.ReactElement) => void = () => {}

function renderShell(over: Partial<Parameters<typeof Shell>[0]> = {}) {
  const result = render(shellTree(over))
  rerender = result.rerender
  return result
}

/** Re-render the same shell after mutating the mocked `pathname` / `params`. */
function rerenderShell(over: Partial<Parameters<typeof Shell>[0]> = {}) {
  rerender(shellTree(over))
}

beforeEach(() => {
  vi.clearAllMocks()
  pathname = '/weddings'
  params = {}
  paletteWeddings.mockResolvedValue([])
  weddingHeader.mockResolvedValue(null)
})

describe('the sidebar', () => {
  it('names itself, so a screen reader can skip to it', () => {
    renderShell()
    expect(screen.getByRole('navigation', { name: 'Hoofdnavigatie' })).toBeInTheDocument()
  })

  it('shows the organisation at the top and the account at the foot', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })
    expect(within(nav).getByText('Studio A')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /Joren Nagels/ })).toBeInTheDocument()
  })

  /**
   * Guestnote's own wordmark appears on login and on marketing and nowhere in the
   * signed-in app -- this is sold to planners who brand their own service, so our mark
   * above theirs in their workspace is the wrong hierarchy. Asserted because it is the kind
   * of decision a later "add the logo to the sidebar" commit undoes without noticing.
   */
  it('does not put the product name in the planner.s workspace', () => {
    renderShell()
    // Both forms: the "add the logo to the sidebar" commit this exists to stop would arrive
    // as an <svg role="img" aria-label> or an <img alt>, neither of which is a text node.
    expect(screen.queryByText(/guestnote/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /guestnote/i })).toBeNull()
  })

  it('falls back to the email when the user has no name yet', () => {
    // Better Auth's OTP flow creates the account before asking for a name, so null is real.
    renderShell({ user: { name: null, email: 'joren@example.test' } })
    expect(screen.getByRole('button', { name: /joren@example.test/ })).toBeInTheDocument()
  })
})

describe('the organisation head', () => {
  /**
   * One org is not "a menu with one item" -- it is not a menu. Nearly every planner is staff
   * at exactly one organisation, so a switcher would be a control that never does anything.
   */
  it('is a plain label when there is nowhere to switch to', () => {
    renderShell({ orgs: [STUDIO_A] })
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })
    // Scoped to the nav on purpose: the phone header renders the org name too, so an
    // unscoped query matches twice. That is by design -- the name is visible on a phone
    // before the drawer is opened -- and the test should say so rather than route around it.
    expect(within(nav).getByText('Studio A')).toBeInTheDocument()
    // No disclosure affordance at all -- not a disabled control, not a chevron that does
    // nothing. Asserted as "the name is not inside a button", because the nav legitimately
    // holds other collapsed controls (search, the account menu) and a bare
    // `queryByRole('button', { expanded: false })` matches those instead.
    expect(within(nav).getByText('Studio A').closest('button')).toBeNull()
  })

  it('becomes a menu at two organisations, listing both', () => {
    renderShell({ orgs: [ATELIER, STUDIO_A] })
    const trigger = screen.getByRole('button', { expanded: false, name: /Studio A/ })
    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Atelier Zero/ })).toBeInTheDocument()
  })

  it('marks the current organisation with state and not only a tick', () => {
    renderShell({ orgs: [ATELIER, STUDIO_A] })
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Studio A/ }))
    // `aria-pressed`, because a checkmark glyph announces nothing. research/08's rule that
    // a state is never carried by hue alone, one layer up.
    expect(screen.getByRole('button', { name: /Studio A/, pressed: true })).toBeInTheDocument()
  })

  it('switches to another organisation and does not re-send the current one', () => {
    renderShell({ orgs: [ATELIER, STUDIO_A] })
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Studio A/ }))

    fireEvent.click(screen.getByRole('button', { name: /Atelier Zero/ }))
    expect(switchOrg).toHaveBeenCalledWith('org-c-id')

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Studio A/ }))
    fireEvent.click(screen.getByRole('button', { name: /Studio A/, pressed: true }))
    expect(switchOrg).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and gives focus back to the trigger', () => {
    renderShell({ orgs: [ATELIER, STUDIO_A] })
    const trigger = screen.getByRole('button', { expanded: false, name: /Studio A/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // The half people forget. Closing without returning focus drops a keyboard user at the
    // top of the document.
    expect(trigger).toHaveFocus()
  })
})

describe('the collapsed rail', () => {
  it('keeps an accessible name on every target when the labels are gone', () => {
    renderShell({ initialNav: 'collapsed' })
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })

    /**
     * Swept rather than enumerated, and that is the point. The hand-written version listed
     * two targets and passed while the search row -- rendered with a hard-coded
     * `collapsed={false}` -- had no label at all, so the property this test claims was
     * already false for a row it never looked at. A loop cannot miss the next one.
     */
    for (const el of nav.querySelectorAll('a, button')) {
      expect(el, `${el.tagName} "${el.textContent}" has no aria-label on the rail`).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/\S/),
      )
    }

    const link = screen.getByRole('link', { name: 'Bruiloften' })

    /**
     * `toHaveAttribute('aria-label')` and not only `getByRole({ name })`, and the
     * difference is the whole assertion. `title` ALSO contributes to the accessible name,
     * so the name-based query passed with `aria-label` deleted -- measured 2026-08-21 by
     * deleting it. The tooltip was silently the only thing naming the target, which is the
     * exact failure this test claims to prevent: `title` is unreachable by touch, is
     * announced inconsistently, and never appears for a keyboard user at all.
     */
    expect(link).toHaveAttribute('aria-label', 'Bruiloften')
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-label')
    // The org name is real text, not a label on a wrapper: announced, findable by in-page
    // search, and it survives the CSS being wrong.
    expect(screen.getByText(/Organisatie: Studio A/)).toBeInTheDocument()
  })

  /**
   * The rail WITH a switcher, which no case covered: `initialNav: 'collapsed'` was only ever
   * paired with one org, which takes the plain-label branch entirely. Delete the trigger's
   * `aria-label` and it is named by `title` alone -- the same `title`-shaped hole that was
   * already found once in `NavItem`, live one component over.
   */
  it('names the org switcher on the rail with a label, not a tooltip', () => {
    renderShell({ initialNav: 'collapsed', orgs: [ATELIER, STUDIO_A] })
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })
    expect(
      within(nav).getByRole('button', { expanded: false, name: /organisatie/i }),
    ).toHaveAttribute('aria-label', 'Van organisatie wisselen')
  })

  it('persists the choice, so it survives a reload', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Zijbalk inklappen' }))
    expect(setNavCollapsed).toHaveBeenCalledWith('collapsed')
    const expand = screen.getByRole('button', { name: 'Zijbalk uitklappen' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')

    // Both directions. A constant `setNavCollapsed('collapsed')` passes the first half, and
    // the rail can then never be un-persisted: every reload comes back collapsed.
    fireEvent.click(expand)
    expect(setNavCollapsed).toHaveBeenLastCalledWith('expanded')
    expect(screen.getByRole('button', { name: 'Zijbalk inklappen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})

describe('the wedding-context section', () => {
  it('is absent on the wedding list', () => {
    renderShell()
    expect(screen.queryByText('Deze bruiloft')).not.toBeInTheDocument()
    expect(weddingHeader).not.toHaveBeenCalled()
  })

  it('appears inside a wedding, named, and marks Overzicht rather than the list', async () => {
    pathname = '/weddings/w1'
    params = { id: 'w1' }
    weddingHeader.mockResolvedValue({ id: 'w1', name: 'Els & Jan', date: '2027-06-12' })
    renderShell()

    await waitFor(() => expect(screen.getByText('Els & Jan')).toBeInTheDocument())
    expect(weddingHeader).toHaveBeenCalledWith('w1')

    // Inside a wedding the section is where you are, so the list must NOT also read as
    // current -- marking both says two places are one place.
    expect(screen.getByRole('link', { name: 'Overzicht' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Bruiloften' })).not.toHaveAttribute('aria-current')
  })

  /**
   * Navigating BETWEEN two weddings, which is the only case that can observe the clear.
   *
   * A first render cannot: the state starts `null`, so `setWedding(null)` is a no-op there
   * and deleting it left this green -- measured 2026-08-21. The mutation only shows up on a
   * transition, so the test has to make one.
   */
  it('drops the previous wedding.s name while the next one loads', async () => {
    pathname = '/weddings/w1'
    params = { id: 'w1' }
    weddingHeader.mockResolvedValue({ id: 'w1', name: 'Els & Jan', date: null })
    const { rerender } = renderShell()
    await waitFor(() => expect(screen.getByText('Els & Jan')).toBeInTheDocument())

    // Now jump to another wedding whose fetch has not resolved yet.
    let resolve: (v: unknown) => void = () => {}
    weddingHeader.mockReturnValue(new Promise((r) => (resolve = r)))
    pathname = '/weddings/w2'
    params = { id: 'w2' }
    await act(async () => {
      rerender(
        <Shell
          org={STUDIO_A}
          orgs={[STUDIO_A]}
          user={{ name: 'Joren Nagels', email: 'joren@example.test' }}
          initialNav="expanded"
          locale="nl"
          theme="light"
          density="comfortable"
          labels={LABELS}
        >
          <p>page body</p>
        </Shell>,
      )
    })

    // A heading that lags says you are somewhere you are not, which is worse than a heading
    // that is briefly absent.
    expect(screen.queryByText('Els & Jan')).not.toBeInTheDocument()

    await act(async () => {
      resolve({ id: 'w2', name: 'Mira & Tom', date: null })
    })
    expect(screen.getByText('Mira & Tom')).toBeInTheDocument()
  })
})

describe('the palette', () => {
  it('opens on Cmd-K and on Ctrl-K, because planners move between machines', async () => {
    renderShell()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Zoek een bruiloft' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('dialog', { name: 'Zoek een bruiloft' })).toBeInTheDocument()
  })

  it('fetches its list once per page load, not once per open', async () => {
    paletteWeddings.mockResolvedValue([
      {
        id: 'w1',
        slug: 'els-en-jan',
        status: 'live',
        coupleDisplayName: 'Els & Jan',
        weddingDate: '2027-06-12',
      },
    ])
    renderShell()

    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Els & Jan/ })).toBeInTheDocument(),
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Els & Jan/ })).toBeInTheDocument(),
    )

    expect(paletteWeddings).toHaveBeenCalledTimes(1)
  })

  it('filters locally on name and on slug', async () => {
    paletteWeddings.mockResolvedValue([
      {
        id: 'w1',
        slug: 'els-en-jan',
        status: 'live',
        coupleDisplayName: 'Els & Jan',
        weddingDate: null,
      },
      {
        id: 'w2',
        slug: 'mira-tom',
        status: 'draft',
        coupleDisplayName: 'Mira & Tom',
        weddingDate: null,
      },
    ])
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    const input = await screen.findByRole('combobox')

    fireEvent.change(input, { target: { value: 'mira' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)

    // A planner who has typed `els-en-jan` into a URL bar all week will type that.
    fireEvent.change(input, { target: { value: 'els-en' } })
    expect(screen.getByRole('option', { name: /Els & Jan/ })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('Niets gevonden.')).toBeInTheDocument()
  })

  it('moves the active option with the arrows and keeps focus in the input', async () => {
    paletteWeddings.mockResolvedValue([
      { id: 'w1', slug: 'a', status: 'live', coupleDisplayName: 'Els & Jan', weddingDate: null },
      { id: 'w2', slug: 'b', status: 'live', coupleDisplayName: 'Mira & Tom', weddingDate: null },
    ])
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    const input = await screen.findByRole('combobox')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Mira & Tom/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // Focus never leaves the input -- moving DOM focus to each option would fight the
    // typing, which is why `aria-activedescendant` exists.
    // Focus-on-open, not "focus stays put as arrows move" -- the options are tabIndex={-1}
    // so nothing in the code path can move it. This guards `palette.tsx`'s focus effect.
    expect(input).toHaveFocus()

    /**
     * The VALUE, not merely the attribute's presence. `aria-activedescendant` IS the
     * announcement, so pinning it to `rows[0]` would leave a screen-reader user hearing the
     * first wedding while the highlight sat on the second -- and an existence check passes
     * through that unchanged, as would dropping the id prefix so the reference dangles.
     */
    const active = screen.getByRole('option', { selected: true })
    expect(active.id).not.toBe('')
    expect(input).toHaveAttribute('aria-activedescendant', active.id)
  })
})

describe('the palette actually goes somewhere', () => {
  const ROWS = [
    {
      id: 'w1',
      slug: 'els-en-jan',
      status: 'live',
      coupleDisplayName: 'Els & Jan',
      weddingDate: null,
    },
    {
      id: 'w2',
      slug: 'mira-tom',
      status: 'live',
      coupleDisplayName: 'Mira & Tom',
      weddingDate: null,
    },
  ]

  /**
   * `window.location.assign` is stubbed the way `components/auth/auth-flow.test.ts` already
   * does it. Without these two cases `choose()` could be an empty function and every other
   * assertion in this file would still pass -- and "jump to any wedding by typing" is the
   * entire reason `/weddings/[id]` was built.
   */
  let assign: ReturnType<typeof vi.fn>

  const openPalette = async () => {
    paletteWeddings.mockResolvedValue(ROWS)
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    const input = await screen.findByRole('combobox')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
    return input
  }

  beforeEach(() => {
    assign = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      writable: true,
    })
  })

  it('navigates to the highlighted wedding on Enter', async () => {
    const input = await openPalette()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // The literal path, not `app.wedding('w2')` -- otherwise the assertion moves with the bug.
    expect(assign).toHaveBeenCalledWith('/weddings/w2')
  })

  it('navigates on pointer down, which is also what dismisses the backdrop', async () => {
    await openPalette()
    fireEvent.pointerDown(screen.getByRole('option', { name: /Els & Jan/ }))
    expect(assign).toHaveBeenCalledWith('/weddings/w1')
  })

  it('swallows the browser.s own Ctrl-K, or the palette never opens in Firefox', () => {
    renderShell()
    const ev = createEvent.keyDown(document, { key: 'k', ctrlKey: true })
    fireEvent(document, ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('says it is loading rather than saying nothing was found', async () => {
    let resolve: (v: unknown) => void = () => {}
    paletteWeddings.mockReturnValue(new Promise((r) => (resolve = r)))
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))

    // Rendering `empty` in the not-yet-fetched branch would tell every planner "Niets
    // gevonden." for the length of the round trip.
    expect(screen.getByText('Even zoeken…')).toBeInTheDocument()
    expect(screen.queryByText('Niets gevonden.')).not.toBeInTheDocument()
    await act(async () => {
      resolve([])
    })
    expect(screen.getByText('Niets gevonden.')).toBeInTheDocument()
  })

  it('does not re-fetch for an org that genuinely has no weddings', async () => {
    // `weddings === null` means "never fetched" and `[]` means "fetched, none". Collapsing
    // them re-fetches on every open forever, and a one-row fixture cannot see it.
    paletteWeddings.mockResolvedValue([])
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    await waitFor(() => expect(screen.getByText('Niets gevonden.')).toBeInTheDocument())
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /Zoeken/ }))
    await waitFor(() => expect(screen.getByText('Niets gevonden.')).toBeInTheDocument())
    expect(paletteWeddings).toHaveBeenCalledTimes(1)
  })
})

describe('the phone drawer', () => {
  /**
   * jsdom has no media queries, so `hidden md:block` renders anyway and the drawer's sidebar
   * is a SECOND copy of the whole nav. Every query in this block is therefore scoped with
   * `within(dialog)` -- an unscoped `getByRole('navigation')` throws "found multiple
   * elements" the moment the drawer opens, which is very likely why this surface had no
   * tests at all until a review asked for them.
   */
  const open = ({ fresh = true } = {}) => {
    if (fresh) renderShell()
    const button = screen.getByRole('button', { name: 'Menu openen' })
    fireEvent.click(button)
    return button
  }

  it('opens, and inerts the rest of the page rather than trapping focus by hand', () => {
    const button = open()
    const dialog = screen.getByRole('dialog', { name: 'Hoofdnavigatie' })
    expect(within(dialog).getByRole('navigation', { name: 'Hoofdnavigatie' })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')

    /**
     * `inert` must be on the COLUMN and not on `<main>`. It was on `<main>` first, which left
     * the phone header -- a sibling -- tabbable, so you could Tab out of the drawer onto the
     * very button the drawer covers. Asserting the ancestor is what pins the fix: this
     * passes only while the inerted element also contains the menu button.
     */
    const inerted = document.querySelector('[inert]')
    expect(inerted).not.toBeNull()
    expect(inerted).toContainElement(button)
  })

  it('does not inert anything while closed', () => {
    renderShell()
    // `drawer || undefined` matters: `inert={false}` renders `inert="false"`, and any present
    // value is TRUE in HTML, so the boolean-looking form would inert the page permanently.
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('closes on Escape and returns focus to the button it covered', () => {
    const button = open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Hoofdnavigatie' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes on the close button, returning focus', () => {
    // Three separate call sites do `setDrawer(false); focus()`, and any one of them can lose
    // the focus line on its own -- so each is asserted rather than one standing for all.
    const button = open()
    fireEvent.click(screen.getByRole('button', { name: 'Menu sluiten' }))
    expect(screen.queryByRole('dialog', { name: 'Hoofdnavigatie' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('offers exactly one close control to assistive tech, not two', () => {
    open()
    // The backdrop is `aria-hidden` on purpose: it used to be a labelled button, which put a
    // second identical "Menu sluiten" in the tree -- one of them an invisible full-screen
    // rectangle. This is the assertion that keeps it out.
    expect(screen.getAllByRole('button', { name: 'Menu sluiten' })).toHaveLength(1)
  })

  it('closes on the backdrop, for a thumb that misses', () => {
    const button = open()
    const backdrop = document.querySelector('[aria-hidden="true"].absolute.inset-0')
    fireEvent.click(backdrop as Element)
    expect(screen.queryByRole('dialog', { name: 'Hoofdnavigatie' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes when the route changes, not just when a link is clicked', async () => {
    open()
    pathname = '/weddings/w9'
    params = { id: 'w9' }
    await act(async () => {
      rerenderShell()
    })
    // Deleting the derived `seenPath !== pathname` block leaves every other case green.
    expect(screen.queryByRole('dialog', { name: 'Hoofdnavigatie' })).not.toBeInTheDocument()
  })
})

describe('the account menu writes', () => {
  const openAccount = () => fireEvent.click(screen.getByRole('button', { name: /Joren Nagels/ }))

  it('sets the theme, and skips the write when it is already chosen', () => {
    renderShell({ theme: 'light' })
    openAccount()
    fireEvent.click(screen.getByRole('button', { name: 'Donker' }))
    expect(setTheme).toHaveBeenCalledWith('dark')

    openAccount()
    fireEvent.click(screen.getByRole('button', { name: 'Licht' }))
    // A no-op write is a full shell re-render for nothing, so it is skipped rather than sent.
    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('sets the density, and marks the current one as state and not only a tick', () => {
    renderShell({ density: 'comfortable' })
    openAccount()
    expect(screen.getByRole('button', { name: 'Ruim', pressed: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(setDensity).toHaveBeenCalledWith('compact')
  })

  it('writes the locale through the shared switcher', () => {
    renderShell()
    openAccount()
    fireEvent.click(screen.getByRole('button', { name: 'FR' }))
    expect(setLocale).toHaveBeenCalledWith('fr')
  })

  /**
   * Sign-out is a FORM, not a button calling the action, and that is the whole assertion:
   * `signOut` redirects, and a redirect thrown inside a transition is swallowed. Mutating it
   * to `onClick={() => signOut()}` typechecks and passes every other test, and sign-out then
   * silently stops working. Nothing anywhere in this repo asserted it before.
   */
  it('signs out through a form, so the redirect is not swallowed', () => {
    renderShell()
    openAccount()
    const button = screen.getByRole('button', { name: 'Afmelden' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button.closest('form')).not.toBeNull()
  })
})
