import { LocaleSwitcher } from '@guestnote/ui/locale-switcher'
import { useState } from 'react'

const LOCALES = ['nl', 'en', 'fr'] as const

export function Links() {
  return (
    <LocaleSwitcher
      locales={LOCALES}
      current="nl"
      label="Language"
      hrefFor={(locale) => `/${locale}`}
    />
  )
}

export function InPlace() {
  const [current, setCurrent] = useState<(typeof LOCALES)[number]>('en')
  return (
    <LocaleSwitcher locales={LOCALES} current={current} label="Language" onSelect={setCurrent} />
  )
}

export function Disabled() {
  return (
    <LocaleSwitcher locales={LOCALES} current="fr" label="Language" onSelect={() => {}} disabled />
  )
}
