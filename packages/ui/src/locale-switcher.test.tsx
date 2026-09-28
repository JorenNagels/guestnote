import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LocaleSwitcher } from './locale-switcher.tsx'

/**
 * The sliding pill is decoration, but a wrong index puts it under the wrong language while
 * `aria-current` says otherwise -- the eye and the screen reader then disagree. So its
 * position is asserted, by the one inline style the component has.
 */
function pill(current: string) {
  const { container } = render(
    <LocaleSwitcher locales={['nl', 'en', 'fr']} current={current} label="Language" />,
  )
  return container.querySelector<HTMLElement>('nav > span[aria-hidden="true"]')
}

describe('LocaleSwitcher', () => {
  it('slides the pill one segment per index', () => {
    expect(pill('en')?.style.transform).toBe('translateX(100%)')
  })

  it('slides it to the last segment', () => {
    expect(pill('fr')?.style.transform).toBe('translateX(200%)')
  })

  it('parks it on the first segment when current is not in the list', () => {
    expect(pill('de')?.style.transform).toBe('translateX(0%)')
  })
})
