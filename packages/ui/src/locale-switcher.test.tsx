import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocaleSwitcher } from './locale-switcher.tsx'

const NAMES = { nl: 'Nederlands', en: 'English', fr: 'Français' }

function renderSwitcher(props: Partial<Parameters<typeof LocaleSwitcher<string>>[0]> = {}) {
  const onSelect = vi.fn()
  const utils = render(
    <LocaleSwitcher
      locales={['nl', 'en', 'fr']}
      current="nl"
      label="Language"
      names={NAMES}
      onSelect={onSelect}
      {...props}
    />,
  )
  const details = utils.container.querySelector('details')
  if (!details) throw new Error('no <details>')
  return { ...utils, onSelect, details }
}

/**
 * The dropdown's contract: the trigger names the current language, the current one is
 * marked and is not a control, and every way of leaving the list closes it.
 */
describe('LocaleSwitcher', () => {
  it('shows the current code on the trigger and marks the current language', () => {
    renderSwitcher()
    const nav = screen.getByRole('navigation', { name: 'Language' })
    expect(within(nav).getByText('NL').tagName).toBe('SUMMARY')
    const current = within(nav).getByText('Nederlands').closest('[aria-current]')
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current?.tagName).toBe('SPAN')
  })

  it('names each language in its own words, with its lang', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('lang', 'fr')
  })

  it('calls onSelect and closes after a choice', () => {
    const { details, onSelect } = renderSwitcher()
    details.open = true
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(onSelect).toHaveBeenCalledWith('en')
    expect(details.open).toBe(false)
  })

  it('renders links, not buttons, when given hrefs', () => {
    renderSwitcher({ hrefs: { nl: '/nl', en: '/en', fr: '/fr' } })
    const link = screen.getByRole('link', { name: 'English' })
    expect(link).toHaveAttribute('href', '/en')
    expect(link).toHaveAttribute('hreflang', 'en')
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument()
  })

  it('closes on Escape and hands focus back to the trigger', () => {
    const { details } = renderSwitcher()
    details.open = true
    fireEvent.keyDown(screen.getByRole('button', { name: 'English' }), { key: 'Escape' })
    expect(details.open).toBe(false)
    expect(document.activeElement?.tagName).toBe('SUMMARY')
  })

  it('closes on a press outside, and not on one inside', () => {
    const { details } = renderSwitcher()
    details.open = true
    fireEvent.pointerDown(screen.getByText('Nederlands'))
    expect(details.open).toBe(true)
    fireEvent.pointerDown(document.body)
    expect(details.open).toBe(false)
  })
})
