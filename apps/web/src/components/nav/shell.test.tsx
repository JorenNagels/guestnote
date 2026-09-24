import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellLabels, ShellWedding } from './shell.tsx'

/**
 * The dashboard's chrome, rendered for real.
 *
 * ## What is mocked, and why only this much
 *
 * Two things leave the browser and nothing else is replaced: the Server Functions in
 * `(app)/actions.ts` (POST requests here) and `next/navigation`'s router hooks (there is no
 * router in jsdom). The wedding list is a plain prop -- the layout resolves it -- so nothing
 * here stands in for a database. `OrgHead`, `AccountMenu`, `Palette`, `Menu`, `NavItem`, `Monogram` and
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
 *
 * The one clock-dependent thing, the countdown on each wedding row, is pinned with
 * `vi.setSystemTime` WITHOUT `useFakeTimers`: with fake timers off it replaces `Date` only and
 * leaves the timers real, which is the half the countdown needs and none of the half that hangs
 * `waitFor`.
 */
const setNavCollapsed = vi.fn()
const switchOrg = vi.fn()
const setTheme = vi.fn()
const setDensity = vi.fn()
const paletteWeddings = vi.fn()
const setLocale = vi.fn()
const replace = vi.fn()
const platformAuthenticatorAvailable = vi.fn()
const createPasskey = vi.fn()
let pathname = '/weddings'
let params: Record<string, string> = {}
let searchParams = ''

vi.mock('../../app/pro/(app)/actions.ts', () => ({
  setNavCollapsed: (...a: unknown[]) => setNavCollapsed(...a),
  switchOrg: (...a: unknown[]) => switchOrg(...a),
  setTheme: (...a: unknown[]) => setTheme(...a),
  setDensity: (...a: unknown[]) => setDensity(...a),
  paletteWeddings: () => paletteWeddings(),
  signOut: vi.fn(),
}))

const sendReport = vi.fn()
vi.mock('../../app/pro/(app)/report/actions.ts', () => ({
  sendReport: (...a: unknown[]) => sendReport(...a),
}))

vi.mock('../auth/actions.ts', () => ({
  setLocale: (...a: unknown[]) => setLocale(...a),
  beginPasskeyEnrollment: vi.fn(),
  finishPasskeyEnrollment: vi.fn(),
  reportCeremonyFailure: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useParams: () => params,
  // `EnrollmentPrompt` reads these. It is rendered for real rather than mocked -- the shell's
  // job here is to mount it in the right place and hand it the right labels, and a stub
  // could not fail if it were mounted outside the `inert` column.
  useSearchParams: () => new URLSearchParams(searchParams),
  useRouter: () => ({ replace: (...a: unknown[]) => replace(...a) }),
}))

vi.mock('../auth/passkey.ts', () => ({
  platformAuthenticatorAvailable: () => platformAuthenticatorAvailable(),
  createPasskey: (...a: unknown[]) => createPasskey(...a),
}))

const { Shell } = await import('./shell.tsx')

const LABELS: ShellLabels = {
  poweredBy: 'Mogelijk gemaakt door',
  nav: 'Hoofdnavigatie',
  weddings: 'Bruiloften',
  today: 'Vandaag',
  templates: 'Sjablonen',
  vendors: 'Leveranciers',
  team: 'Team',
  weddingsSection: 'Jouw bruiloften',
  newWedding: 'Nieuwe bruiloft',
  wedding: {
    overview: 'Overzicht',
    checklist: 'Checklist',
    budget: 'Budget',
    payments: 'Betalingen',
    vendors: 'Leveranciers',
    runSheet: 'Draaiboek',
    files: 'Bestanden',
    moodboard: 'Moodboard',
  },
  row: {
    noDate: 'Nog geen datum',
    archived: 'Gearchiveerd',
    today: 'Vandaag is het zover',
    untilOne: 'Nog {days} dag',
    untilOther: 'Nog {days} dagen',
    sinceOne: '{days} dag geleden',
    sinceOther: '{days} dagen geleden',
  },
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
    report: 'Een probleem melden',
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
  enroll: {
    title: 'ENROLL-TITLE',
    body: 'ENROLL-BODY',
    confirm: 'ENROLL-CONFIRM',
    dismiss: 'ENROLL-DISMISS',
    busy: 'ENROLL-BUSY',
  },
  demoBanner: { pill: 'DEMO', body: 'DEMO-BODY', ask: 'DEMO-ASK', action: 'Meld het' },
  report: {
    title: 'REPORT-TITLE',
    close: 'Sluiten',
    category: 'Soort',
    categories: { bug: 'Fout', idea: 'Idee', question: 'Vraag' },
    message: 'Wat gebeurde er?',
    screenshot: 'Schermafbeelding',
    removeScreenshot: 'Verwijderen',
    send: 'Versturen',
    sending: 'Versturen…',
    sent: 'REPORT-SENT',
    errors: {
      forbidden: 'E-FORBIDDEN',
      empty: 'E-EMPTY',
      tooLong: 'E-TOOLONG',
      badScreenshot: 'E-BADSHOT',
      tooLarge: 'E-TOOLARGE',
      rateLimited: 'E-RATE',
      unavailable: 'E-UNAVAILABLE',
    },
  },
}

const STUDIO_A = { id: 'org-a-id', name: 'Studio A', slug: 'org-a' }
const ATELIER = { id: 'org-c-id', name: 'Atelier Zero', slug: 'org-c' }

function shellTree(over: Partial<Parameters<typeof Shell>[0]> = {}) {
  return (
    <Shell
      org={STUDIO_A}
      orgs={[STUDIO_A]}
      weddings={[]}
      user={{ name: 'Joren Nagels', email: 'joren@example.test' }}
      offerPasskey={false}
      productHref="https://guestnote.example"
      initialNav="expanded"
      locale="nl"
      theme="light"
      density="comfortable"
      banner={null}
      canReport={false}
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
  searchParams = ''
  paletteWeddings.mockResolvedValue([])
  platformAuthenticatorAvailable.mockResolvedValue(true)
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
   * Guestnote's own wordmark stays out of the planner's navigation -- this is sold to
   * planners who brand their own service, so our mark above theirs in their workspace is the
   * wrong hierarchy. Since 2026-09-24 the product does name itself once, in the footer under
   * the org's name (next test); this one was narrowed from the whole shell to the sidebar
   * then, and still exists because "add the logo to the sidebar" is the commit it stops.
   */
  it('does not put the product name in the sidebar', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })
    // Both forms: the "add the logo to the sidebar" commit this exists to stop would arrive
    // as an <svg role="img" aria-label> or an <img alt>, neither of which is a text node.
    expect(within(nav).queryByText(/guestnote/i)).not.toBeInTheDocument()
    expect(within(nav).queryByRole('img', { name: /guestnote/i })).toBeNull()
  })

  it('names the org and then, once and below it, the product, in the footer', () => {
    renderShell()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('Studio A')).toBeInTheDocument()
    const link = within(footer).getByRole('link', { name: 'Mogelijk gemaakt door Guestnote' })
    expect(link).toHaveAttribute('href', 'https://guestnote.example')
    // A new tab, so a click on the fine print does not throw away a half-filled form.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
    // Once, as text, and never as a mark anywhere in the shell -- the phone header is outside the
    // sidebar landmark, so the sidebar test alone would let a logo in there.
    expect(screen.getAllByText(/guestnote/i)).toHaveLength(1)
    expect(screen.queryAllByRole('img', { name: /guestnote/i })).toHaveLength(0)
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

const ELS: ShellWedding = {
  id: 'w1',
  name: 'Els & Jan',
  date: '2026-11-02',
  status: 'live',
  color: '#7A6A9B',
}
const MIRA: ShellWedding = {
  id: 'w2',
  name: 'Mira & Tom',
  date: null,
  status: 'draft',
  color: null,
}

/** The link for one org-level item, by its literal label. */
const item = (name: string) => screen.getByRole('link', { name })

describe('the organisation-level items', () => {
  /**
   * The hrefs are literals, not `app.today()` and friends -- otherwise a mistyped builder in
   * `lib/routes.ts` moves the assertion with the bug. Order is asserted too: `getAllByRole`
   * returns document order, and Vandaag-then-Bruiloften is the reading order spec 0003 gives.
   */
  it('lists Today, Weddings, Templates, Vendors and Team, in that order, at their own paths', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })
    const links = within(nav)
      .getAllByRole('link')
      .slice(0, 5)
      .map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Vandaag', '/'],
      ['Bruiloften', '/weddings'],
      ['Sjablonen', '/templates'],
      ['Leveranciers', '/vendors'],
      ['Team', '/team'],
    ])
  })

  it('marks only the page you are on', () => {
    pathname = '/templates'
    renderShell()
    expect(item('Sjablonen')).toHaveAttribute('aria-current', 'page')
    expect(item('Bruiloften')).not.toHaveAttribute('aria-current')
    expect(item('Vandaag')).not.toHaveAttribute('aria-current')
  })

  /**
   * Today lives at `/`, which is a prefix of every path. `NavItem` matches `${href}/` and not a
   * bare `startsWith(href)`, so `//` matches nothing and the item lights on the root alone. Make
   * the prefix arm a bare `startsWith` and the second half fails.
   */
  it('marks Today on the root and on no other page', () => {
    pathname = '/'
    renderShell()
    expect(item('Vandaag')).toHaveAttribute('aria-current', 'page')
    expect(item('Bruiloften')).not.toHaveAttribute('aria-current')

    cleanup()
    pathname = '/weddings'
    renderShell()
    expect(item('Vandaag')).not.toHaveAttribute('aria-current')
    expect(item('Bruiloften')).toHaveAttribute('aria-current', 'page')
  })

  /**
   * The prefix branch, which had no caller until spec 0003 and so no assertion could tell it
   * from `exact`. Delete the `startsWith` arm in `nav-item.tsx` and the first half fails; make
   * it a bare `startsWith(href)` with no trailing slash and the second half fails.
   */
  it('keeps a section marked while one of its detail pages is open, and only its own', () => {
    pathname = '/templates/t9'
    renderShell()
    expect(item('Sjablonen')).toHaveAttribute('aria-current', 'page')

    cleanup()
    pathname = '/templates-archive'
    renderShell()
    expect(item('Sjablonen')).not.toHaveAttribute('aria-current')
  })

  it('does not mark the list on the way to a new wedding, and marks the new-wedding row', () => {
    pathname = '/weddings/new'
    renderShell()
    // `exact` on the list: `/weddings/new` sits under `/weddings`, and two lit rows say two
    // places are one place.
    expect(item('Bruiloften')).not.toHaveAttribute('aria-current')
    expect(item('Nieuwe bruiloft')).toHaveAttribute('aria-current', 'page')
    expect(item('Nieuwe bruiloft')).toHaveAttribute('href', '/weddings/new')
  })
})

describe('the wedding rows', () => {
  beforeEach(() => {
    // Noon UTC on 2026-09-21: the same civil day in Brussels, so no boundary is in play.
    vi.setSystemTime(new Date('2026-09-21T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has one row per wedding under a heading, and only the new-wedding row when there are none', () => {
    renderShell()
    expect(screen.getByText('Jouw bruiloften')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Els & Jan/ })).not.toBeInTheDocument()
    expect(item('Nieuwe bruiloft')).toBeInTheDocument()

    cleanup()
    renderShell({ weddings: [ELS, MIRA] })
    expect(screen.getByRole('link', { name: /Els & Jan/ })).toHaveAttribute('href', '/weddings/w1')
    expect(screen.getByRole('link', { name: /Mira & Tom/ })).toHaveAttribute('href', '/weddings/w2')
  })

  /**
   * The countdown, end to end through the row: 2026-11-02 is 42 days after 2026-09-21. The
   * spoken form is asserted separately because the visible `T-42` is `aria-hidden` -- a screen
   * reader must not be handed "T dash forty-two".
   */
  it('shows T-minus and the short date, and speaks it as words', () => {
    renderShell({ weddings: [ELS] })
    const row = screen.getByRole('link', { name: /Els & Jan/ })
    expect(within(row).getByText('T-42')).toHaveAttribute('aria-hidden', 'true')
    expect(within(row).getByText('Nog 42 dagen')).toBeInTheDocument()
    expect(row).toHaveTextContent(/2 nov/)
  })

  it('counts up after the day, says the day itself, and keeps the singular', () => {
    renderShell({
      weddings: [
        { ...ELS, id: 'a', name: 'Aa', date: '2026-09-18' },
        { ...ELS, id: 'b', name: 'Bb', date: '2026-09-21' },
        { ...ELS, id: 'c', name: 'Cc', date: '2026-09-22' },
      ],
    })
    expect(within(screen.getByRole('link', { name: /Aa/ })).getByText('T+3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Aa/ })).toHaveTextContent('3 dagen geleden')
    expect(within(screen.getByRole('link', { name: /Bb/ })).getByText('T-0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bb/ })).toHaveTextContent('Vandaag is het zover')
    expect(screen.getByRole('link', { name: /Cc/ })).toHaveTextContent('Nog 1 dag')
    expect(screen.getByRole('link', { name: /Cc/ })).not.toHaveTextContent('Nog 1 dagen')
  })

  /**
   * `sort` is stable, so the live weddings keep the order they came in. Reverse the comparator
   * or drop the sort and the archived one is first.
   */
  it('puts archived weddings after the live ones and leaves the rest in order', () => {
    renderShell({
      weddings: [
        { ...ELS, id: 'z', name: 'Oud & Klaar', status: 'archived' },
        { ...ELS, id: 'b', name: 'Bb' },
        MIRA,
      ],
    })
    const rows = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h) => h === '/weddings/z' || h === '/weddings/b' || h === '/weddings/w2')
    expect(rows).toEqual(['/weddings/b', '/weddings/w2', '/weddings/z'])
  })

  it('says so when there is no date, and does not count down an archived wedding', () => {
    renderShell({
      weddings: [MIRA, { ...ELS, id: 'w3', name: 'Oud & Klaar', status: 'archived' }],
    })
    expect(screen.getByRole('link', { name: /Mira & Tom/ })).toHaveTextContent('Nog geen datum')
    const archived = screen.getByRole('link', { name: /Oud & Klaar/ })
    expect(archived).toHaveTextContent('Gearchiveerd')
    expect(within(archived).queryByText(/^T[-+]/)).not.toBeInTheDocument()
  })

  /**
   * `color` is null for every wedding until F1's migration lands, so the null case is the one
   * the app actually ships with today and must draw a neutral dot rather than nothing or a
   * stray `undefined` in a style attribute.
   */
  it('draws the colour as a dot, and a neutral one when there is no colour', () => {
    renderShell({ weddings: [ELS, MIRA] })
    const dot = (name: RegExp) =>
      screen.getByRole('link', { name }).querySelector('[aria-hidden="true"]') as HTMLElement
    expect(dot(/Els & Jan/)).toHaveStyle({ backgroundColor: '#7A6A9B' })
    expect(dot(/Mira & Tom/)).not.toHaveAttribute('style')
  })

  /**
   * The database CHECK promises `#RRGGBB`; this is the UI holding to it. `red` is a value the
   * browser would happily draw, which is what makes it the discriminating input -- an invalid
   * one is dropped by the CSSOM whether or not `safeColor` is there.
   */
  it('draws nothing for a colour that is not a plain hex, even one the browser accepts', () => {
    renderShell({ weddings: [{ ...ELS, color: 'red' }] })
    const row = screen.getByRole('link', { name: /Els & Jan/ })
    expect(row.querySelector('[aria-hidden="true"]')).not.toHaveAttribute('style')
  })

  it('marks the wedding you are inside as current, and the others not', () => {
    pathname = '/weddings/w2/budget'
    params = { id: 'w2' }
    renderShell({ weddings: [ELS, MIRA] })
    expect(screen.getByRole('link', { name: /Mira & Tom/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Els & Jan/ })).not.toHaveAttribute('aria-current')
  })

  it('shows the stripe in the wedding colour on the current row only', () => {
    pathname = '/weddings/w1'
    params = { id: 'w1' }
    renderShell({ weddings: [ELS, { ...ELS, id: 'w9', name: 'Ander & Paar' }] })
    expect(screen.getByRole('link', { name: /Els & Jan/ })).toHaveStyle({
      borderLeftColor: '#7A6A9B',
    })
    expect(screen.getByRole('link', { name: /Ander & Paar/ })).not.toHaveStyle({
      borderLeftColor: '#7A6A9B',
    })
  })
})

describe('the sections inside a wedding', () => {
  const inWedding = (id: string, at = `/weddings/${id}`) => {
    pathname = at
    params = { id }
  }

  it('are absent on the wedding list and on a page with no wedding in it', () => {
    renderShell({ weddings: [ELS] })
    expect(screen.queryByRole('link', { name: 'Draaiboek' })).not.toBeInTheDocument()

    cleanup()
    pathname = '/weddings/new'
    params = {}
    renderShell({ weddings: [ELS] })
    expect(screen.queryByRole('link', { name: 'Draaiboek' })).not.toBeInTheDocument()
  })

  it('list all eight, at their own paths, under the wedding you are in', () => {
    inWedding('w1')
    renderShell({ weddings: [ELS] })
    const group = screen.getByRole('list', { name: 'Els & Jan' })
    const links = within(group)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Overzicht', '/weddings/w1'],
      ['Checklist', '/weddings/w1/tasks'],
      ['Budget', '/weddings/w1/budget'],
      ['Betalingen', '/weddings/w1/payments'],
      ['Leveranciers', '/weddings/w1/vendors'],
      ['Draaiboek', '/weddings/w1/run-sheet'],
      ['Bestanden', '/weddings/w1/files'],
      ['Moodboard', '/weddings/w1/moodboard'],
    ])
  })

  /**
   * The whole point of `current = w.id === weddingId`: sections under the wedding you are in,
   * not under the first row and not under all of them. Two weddings, the second one open.
   */
  it('hang off the open wedding and no other', () => {
    inWedding('w2')
    renderShell({ weddings: [ELS, MIRA] })
    expect(screen.getByRole('list', { name: 'Mira & Tom' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Els & Jan' })).not.toBeInTheDocument()
  })

  it('follow a jump from one wedding to another', () => {
    inWedding('w1')
    renderShell({ weddings: [ELS, MIRA] })
    expect(screen.getByRole('list', { name: 'Els & Jan' })).toBeInTheDocument()

    inWedding('w2')
    rerenderShell({ weddings: [ELS, MIRA] })
    expect(screen.queryByRole('list', { name: 'Els & Jan' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Mira & Tom' })).toBeInTheDocument()
  })

  /**
   * The URL names a wedding the layout did not list -- a wedding in another org, or a `member`
   * who is not assigned. The list is what the principal may see, so nothing hangs off it.
   * The page answers 404; the sidebar must not have said the wedding exists.
   */
  it('do not appear for a wedding that is not in the list', () => {
    inWedding('w-not-mine')
    renderShell({ weddings: [ELS] })
    expect(screen.queryByRole('link', { name: 'Draaiboek' })).not.toBeInTheDocument()
  })

  it('mark Overzicht on the wedding itself, and the list not at all', () => {
    inWedding('w1')
    renderShell({ weddings: [ELS] })
    expect(screen.getByRole('link', { name: 'Overzicht' })).toHaveAttribute('aria-current', 'page')
    // Inside a wedding the section is where you are, so the list must NOT also read as
    // current -- marking both says two places are one place.
    expect(screen.getByRole('link', { name: 'Bruiloften' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Checklist' })).not.toHaveAttribute('aria-current')
  })

  it('keep Checklist marked on a task page, and Overzicht not', () => {
    inWedding('w1', '/weddings/w1/tasks/t9')
    renderShell({ weddings: [ELS] })
    expect(screen.getByRole('link', { name: 'Checklist' })).toHaveAttribute('aria-current', 'page')
    // `exact` on Overzicht: every section is under `/weddings/w1`.
    expect(screen.getByRole('link', { name: 'Overzicht' })).not.toHaveAttribute('aria-current')
  })

  it('keep a name on every target on the rail, wedding rows and sections included', () => {
    inWedding('w1')
    renderShell({ initialNav: 'collapsed', weddings: [ELS, MIRA] })
    const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' })
    for (const el of nav.querySelectorAll('a, button')) {
      expect(el, `${el.tagName} "${el.textContent}" has no aria-label on the rail`).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/\S/),
      )
    }
    // The wedding row, by attribute: `title` also names a link, so the role query would pass
    // with the `aria-label` deleted -- the same hole the rail test above records for `NavItem`.
    expect(screen.getByRole('link', { name: 'Mira & Tom' })).toHaveAttribute(
      'aria-label',
      'Mira & Tom',
    )
    // The rail has no room to write the countdown out; it must not leak into the name.
    expect(screen.getByRole('link', { name: 'Mira & Tom' })).not.toHaveTextContent('T-')
    // The chip is the only thing a sighted user reads on the rail. Two initials, split on the
    // `&`, so the pair reads `MT` and not `M` or `Mi`. Its `aria-hidden` and the `sr-only` name
    // beside it cannot be discriminated by any assertion here -- the `aria-label` above wins the
    // accessible name either way -- so the `sr-only` span is held by lint (`useAnchorContent`)
    // and by nothing in this file.
    expect(screen.getByRole('link', { name: 'Mira & Tom' })).toHaveTextContent(/MT/)
    expect(screen.getByRole('link', { name: 'Els & Jan' })).toHaveTextContent(/EJ/)
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

describe('the demo banner and "Report a problem" (spec 0005)', () => {
  const openAccount = () => fireEvent.click(screen.getByRole('button', { name: /Joren Nagels/ }))

  it('shows the demo banner above the page, inside main, when the layout asks for it', () => {
    renderShell({ banner: 'demo', canReport: true })
    const banner = screen.getByRole('region', { name: 'DEMO' })
    expect(banner).toHaveTextContent('DEMO-BODY DEMO-ASK')
    expect(banner.closest('main')).not.toBeNull()
  })

  it('shows no banner when there is none to show', () => {
    renderShell({ banner: null })
    expect(screen.queryByRole('region', { name: 'DEMO' })).toBeNull()
  })

  it('opens the report dialog from the banner and from the account menu', () => {
    renderShell({ banner: 'demo', canReport: true })
    fireEvent.click(screen.getByRole('button', { name: 'Meld het' }))
    expect(screen.getByRole('dialog', { name: 'REPORT-TITLE' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    openAccount()
    fireEvent.click(screen.getByRole('button', { name: 'Een probleem melden' }))
    expect(screen.getByRole('dialog', { name: 'REPORT-TITLE' })).toBeInTheDocument()
  })

  it('starts a reopened dialog empty, even after a send -- closing unmounts it', async () => {
    sendReport.mockResolvedValue({ ok: true })
    renderShell({ banner: 'demo', canReport: true })
    fireEvent.click(screen.getByRole('button', { name: 'Meld het' }))
    fireEvent.change(screen.getByLabelText('Wat gebeurde er?'), { target: { value: 'kapot' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Versturen' }))
    })
    expect(screen.getByRole('status')).toHaveTextContent('REPORT-SENT')

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    fireEvent.click(screen.getByRole('button', { name: 'Meld het' }))
    expect(screen.getByLabelText('Wat gebeurde er?')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Versturen' })).toBeInTheDocument()
  })

  it('offers the menu row without a banner, and closes the menu when it opens the dialog', () => {
    renderShell({ banner: null, canReport: true })
    openAccount()
    fireEvent.click(screen.getByRole('button', { name: 'Een probleem melden' }))
    expect(screen.getByRole('dialog', { name: 'REPORT-TITLE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Afmelden' })).toBeNull()
  })

  // The dialog's own `canReport &&` mount guard is not what this discriminates: without an
  // inbox `openReport` is undefined, so `reporting` can never become true and the guard is
  // unreachable (mutation sweep, 2026-09-24). The entry points below are the real gate.
  it('offers no way to report when there is no inbox, but still says demo', () => {
    renderShell({ banner: 'demo', canReport: false })
    const banner = screen.getByRole('region', { name: 'DEMO' })
    expect(banner).toHaveTextContent('DEMO-BODY')
    expect(banner).not.toHaveTextContent('DEMO-ASK')
    expect(screen.queryByRole('button', { name: 'Meld het' })).toBeNull()
    openAccount()
    expect(screen.queryByRole('button', { name: 'Een probleem melden' })).toBeNull()
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

/**
 * The shell's half of the post-login passkey offer: mount it, in the right place, with the
 * right labels. The ceremony itself and the two client-side gates belong to
 * `enrollment-prompt.test.tsx`; what can only be asserted here is the wiring.
 */
describe('the passkey enrollment offer', () => {
  it('is absent when the server says this user already has one', async () => {
    searchParams = 'welcome=passkey'
    renderShell({ offerPasskey: false })

    // Waited on rather than asserted immediately: the component's own capability gate
    // resolves from a promise, so "not there yet" would pass without the server gate.
    await waitFor(() => expect(platformAuthenticatorAvailable).not.toHaveBeenCalled())
    expect(screen.queryByText('ENROLL-TITLE')).not.toBeInTheDocument()
  })

  it('is absent without the just-signed-in marker, even when the user has no passkey', async () => {
    renderShell({ offerPasskey: true })

    await waitFor(() => expect(platformAuthenticatorAvailable).not.toHaveBeenCalled())
    expect(screen.queryByText('ENROLL-TITLE')).not.toBeInTheDocument()
  })

  it('appears when the server gate and the marker agree', async () => {
    searchParams = 'welcome=passkey'
    renderShell({ offerPasskey: true })

    expect(await screen.findByText('ENROLL-TITLE')).toBeInTheDocument()
  })

  /**
   * The placement rule, and the reason it is asserted here and not in the component's own
   * file: the prompt has to sit INSIDE the column that carries `inert`, or it stays tabbable
   * underneath the open drawer. That is the same bug the shell's own comment records about
   * the phone header having been a sibling of `<main>`.
   */
  it('is inside the region the drawer inerts, not beside it', async () => {
    searchParams = 'welcome=passkey'
    renderShell({ offerPasskey: true })
    const prompt = await screen.findByRole('region', { name: 'ENROLL-TITLE' })

    fireEvent.click(screen.getByRole('button', { name: 'Menu openen' }))

    expect(prompt.closest('[inert]')).not.toBeNull()
  })
})
