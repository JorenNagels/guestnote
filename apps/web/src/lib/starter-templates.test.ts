import { MAX_TEMPLATE_ITEMS } from '@guestnote/db'
import { describe, expect, it } from 'vitest'
import { LOCALES } from './locales.ts'
import { STARTERS, starterTemplates } from './starter-templates.ts'
import { TEMPLATE_LIMITS } from './template-input.ts'

/**
 * The starters are content, but `seedTemplates` refuses the WHOLE seed when one of them breaks
 * a limit (an empty template, a name over 120), and a refused seed is a new studio with no
 * templates. So the limits are checked here, where a typo in the content fails a test rather
 * than a sign-up.
 */
describe('starterTemplates', () => {
  it('offers the three plans spec 0005 names, in that order', () => {
    expect(starterTemplates('nl').map((t) => t.name)).toEqual([
      'Volledige planning · 12 maanden',
      'Gedeeltelijke planning · 6 maanden',
      'Dagcoördinatie',
    ])
  })

  it.each(LOCALES)('is complete and within every limit in %s', (locale) => {
    const templates = starterTemplates(locale)
    expect(templates).toHaveLength(3)
    for (const t of templates) {
      expect(t.name.trim().length).toBeGreaterThan(0)
      expect(t.name.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.name)
      expect(t.description?.length ?? 0).toBeLessThanOrEqual(TEMPLATE_LIMITS.description)
      expect(t.items.length).toBeGreaterThan(0)
      expect(t.items.length).toBeLessThanOrEqual(MAX_TEMPLATE_ITEMS)
      for (const item of t.items) {
        expect(item.title.trim().length).toBeGreaterThan(0)
        expect(item.title.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.title)
        expect(Number.isInteger(item.dueOffsetDays)).toBe(true)
      }
    }
  })

  it('gives each language its own words, and the same plan', () => {
    const [nl, en, fr] = LOCALES.map(starterTemplates)
    nl?.forEach((t, i) => {
      const plan = (x: typeof t | undefined) =>
        x?.items.map((item) => [item.dueOffsetDays, item.visibility, item.assigneeRole])
      expect(plan(en?.[i])).toEqual(plan(t))
      expect(plan(fr?.[i])).toEqual(plan(t))
      // A title copied untranslated into another language is the likeliest content bug.
      t.items.forEach((item, j) => {
        expect(en?.[i]?.items[j]?.title).not.toBe(item.title)
        expect(fr?.[i]?.items[j]?.title).not.toBe(item.title)
      })
    })
  })

  it('runs each plan in date order, so the checklist reads top to bottom', () => {
    for (const s of STARTERS) {
      const days = s.items.map(([d]) => d)
      expect(days).toEqual([...days].sort((a, b) => a - b))
    }
  })
})
