import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stage, type StageContent } from './stage.tsx'

/**
 * Stage is decorative, which is exactly why it is worth a test: a decorative panel that
 * stops being decorative is a regression nobody sees. Everything it displays is said again
 * in the form beside it, so if `aria-hidden` ever comes off, a screen reader reads the
 * whole sign-in surface twice.
 */
function content(overrides: Partial<StageContent> = {}): StageContent {
  return {
    label: 'Bruiloft',
    couple: 'Els & Jan',
    date: '12 juni 2027',
    days: 214,
    unit: 'dagen',
    atoms: [
      { key: 'attending', label: 'Aanwezig' },
      { key: 'awaiting', label: 'In afwachting' },
    ],
    ...overrides,
  }
}

describe('Stage', () => {
  it('is hidden from assistive technology in full', () => {
    const { container } = render(<Stage rung={0} content={content()} />)
    const panel = container.querySelector('aside')
    expect(panel).toHaveAttribute('aria-hidden', 'true')
  })

  it('exposes none of its structure to the accessibility tree', () => {
    // The strong form of the assertion above: not merely that the attribute is present,
    // but that the tree it hides is genuinely unreachable.
    //
    // Deliberately role queries and not `queryByText`. Only *role* queries consult the
    // accessibility tree; `getByText` walks the DOM and matches happily inside an
    // aria-hidden subtree, so a text-based version of this test would pass with
    // `aria-hidden` deleted -- which is the one thing it exists to catch.
    render(<Stage rung={0} content={content()} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('still renders the card content into the DOM for sighted users', () => {
    const { container } = render(<Stage rung={0} content={content()} />)
    expect(container.querySelector('.stage-card-title')?.textContent).toBe('Els & Jan')
    expect(container.querySelector('.stage-card-date')?.textContent).toBe('12 juni 2027')
    expect(container.querySelector('.stage-card-tminus')?.textContent).toBe('214dagen')
  })

  it('carries the rung as a data attribute rather than a class', () => {
    const { container } = render(<Stage rung={2} content={content()} />)
    expect(container.querySelector('aside')).toHaveAttribute('data-rung', '2')
  })

  it('renders one atom per known key', () => {
    const { container } = render(<Stage rung={0} content={content()} />)
    expect(container.querySelectorAll('.atom')).toHaveLength(2)
  })

  it('skips an atom whose key has no chip or placement, instead of throwing', () => {
    // The guard in the component. A status added to the content map but not to CHIP and
    // PLACEMENT must degrade to nothing rendered -- never to a crash on the sign-in screen,
    // and never to a chip with no colour.
    const { container } = render(
      <Stage
        rung={0}
        content={content({
          atoms: [
            { key: 'attending', label: 'Aanwezig' },
            { key: 'not-a-status', label: 'Onbekend' },
          ],
        })}
      />,
    )
    expect(container.querySelectorAll('.atom')).toHaveLength(1)
    expect(container.textContent).not.toContain('Onbekend')
  })

  it('turns its placement string into real CSS custom properties', () => {
    // `style()` hand-parses `--x:9%; --y:17%; ...` into a style object.
    //
    // What this pins is the OUTPUT for the real placement data, and no more than that.
    // `style()` is not exported and is only ever called with the module's own PLACEMENT
    // constants, so its defensive branches are not reachable from here: mutation shows
    // that swapping `indexOf(':')` for `lastIndexOf(':')`, dropping the value `.trim()`,
    // and removing the empty-declaration filter all leave this suite green -- no placement
    // value contains a second colon, a stray space, or a trailing semicolon. Exporting the
    // parser to test those branches would be testing a helper nothing else can call wrong.
    const { container } = render(<Stage rung={0} content={content()} />)
    const atom = container.querySelector<HTMLElement>('.atom')
    expect(atom?.style.getPropertyValue('--x')).toBe('9%')
    expect(atom?.style.getPropertyValue('--dy')).toBe('-16px')
    expect(atom?.style.getPropertyValue('--dur')).toBe('11s')
  })

  it('renders no atoms at all when given none', () => {
    const { container } = render(<Stage rung={0} content={content({ atoms: [] })} />)
    expect(container.querySelectorAll('.atom')).toHaveLength(0)
    expect(container.querySelector('.stage-atoms')).toBeInTheDocument()
  })
})
