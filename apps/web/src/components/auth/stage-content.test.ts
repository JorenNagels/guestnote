import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthCopy } from './copy.ts'

/**
 * The illustrative wedding on the panel beside the form.
 *
 * Worth testing precisely because it is decorative: nobody is watching this number, which
 * is the condition stage-content.ts names for the bug it exists to prevent -- "a login page
 * quietly displaying a negative number is exactly the kind of thing nobody notices for a
 * year".
 *
 * `getFormatter` is mocked to an identifiable ISO string. The point of these tests is WHICH
 * date is chosen and how many days away it is called, not how next-intl renders September
 * in French.
 */
const dateTime = vi.fn((date: Date) => date.toISOString().slice(0, 10))

vi.mock('next-intl/server', () => ({
  getFormatter: async () => ({ dateTime }),
}))

const { getStageContent } = await import('./stage-content.ts')

const copy = {
  stage: {
    label: 'Bruiloft',
    couple: 'Els & Jan',
    unit: 'dagen',
    attending: 'Aanwezig',
    awaiting: 'In afwachting',
    plusone: 'Plus one',
    declined: 'Afgezegd',
    partial: 'Deels',
  },
} as AuthCopy

/** Freezes the clock at an instant expressed in UTC. */
function at(iso: string): void {
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => {
  vi.useFakeTimers()
  dateTime.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the rolling specimen date', () => {
  it('picks this year in January, which is far ahead of September', async () => {
    at('2026-01-15T00:00:00Z')
    const content = await getStageContent(copy)
    expect(content.date).toBe('2026-09-12')
  })

  it('rolls to next year the day after the wedding', async () => {
    at('2026-09-13T00:00:00Z')
    const content = await getStageContent(copy)
    expect(content.date).toBe('2027-09-12')
  })

  it('rolls to next year on the day itself, rather than counting down to zero', async () => {
    // A countdown reading "0 dagen" on a login page is a specimen that has run out.
    at('2026-09-12T00:00:00Z')
    expect((await getStageContent(copy)).date).toBe('2027-09-12')
  })

  it('rolls once the gap closes to 14 days, keeping the number comfortably positive', async () => {
    // The 14-day cushion is the whole mechanism: it rolls while the number is still large
    // enough to look like a real engagement, not at the last moment.
    at('2026-08-29T00:00:00Z') // exactly 14 days before
    expect((await getStageContent(copy)).date).toBe('2027-09-12')
  })

  it('still shows this year just before the cushion is reached', async () => {
    at('2026-08-28T23:00:00Z') // 14 days and one hour before
    expect((await getStageContent(copy)).date).toBe('2026-09-12')
  })

  it('never shows a countdown of 14 days or fewer, at any instant of the year', async () => {
    // The invariant, checked across the whole cycle rather than at hand-picked dates.
    for (const day of [1, 45, 100, 180, 240, 254, 255, 256, 300, 364]) {
      at(new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString())
      const content = await getStageContent(copy)
      expect(content.days).toBeGreaterThan(14)
    }
  })

  it('never shows a negative or zero countdown', async () => {
    for (const iso of ['2026-09-11T23:59:59Z', '2026-09-12T00:00:00Z', '2026-12-31T23:59:59Z']) {
      at(iso)
      expect((await getStageContent(copy)).days).toBeGreaterThan(0)
    }
  })

  it('counts a whole number of days', async () => {
    at('2026-01-15T13:37:42Z')
    const { days } = await getStageContent(copy)
    expect(Number.isInteger(days)).toBe(true)
  })

  it('counts down as the clock advances', async () => {
    at('2026-01-15T00:00:00Z')
    const first = (await getStageContent(copy)).days
    at('2026-01-25T00:00:00Z')
    const later = (await getStageContent(copy)).days
    expect(later).toBe(first - 10)
  })

  it('formats the date with day, month and year, and no time', async () => {
    at('2026-01-15T00:00:00Z')
    await getStageContent(copy)
    expect(dateTime).toHaveBeenCalledWith(expect.any(Date), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  })
})

describe('the content it hands the panel', () => {
  beforeEach(() => at('2026-01-15T00:00:00Z'))

  it('takes its words from the copy object, not from hard-coded strings', async () => {
    const content = await getStageContent(copy)
    expect(content.label).toBe('Bruiloft')
    expect(content.couple).toBe('Els & Jan')
    expect(content.unit).toBe('dagen')
  })

  it('lists the five status atoms in placement order', async () => {
    const content = await getStageContent(copy)
    expect(content.atoms.map((a) => a.key)).toEqual([
      'attending',
      'awaiting',
      'plusone',
      'declined',
      'partial',
    ])
  })

  it('omits `alert`, because red is reserved for things genuinely broken', async () => {
    const content = await getStageContent(copy)
    expect(content.atoms.map((a) => a.key)).not.toContain('alert')
  })

  it('gives every atom a translated label', async () => {
    const content = await getStageContent(copy)
    for (const atom of content.atoms) {
      expect(atom.label).toBeTruthy()
      expect(atom.label).not.toMatch(/^stage\./)
    }
  })

  it('produces keys the Stage component knows how to place', async () => {
    // Stage silently drops an atom whose key has no chip or placement. That degradation is
    // correct there and invisible here, so the two lists are pinned to agree.
    const content = await getStageContent(copy)
    const placeable = ['attending', 'awaiting', 'plusone', 'declined', 'partial']
    for (const atom of content.atoms) expect(placeable).toContain(atom.key)
  })
})
