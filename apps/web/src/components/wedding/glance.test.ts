import { describe, expect, it } from 'vitest'
import { vendorProgress } from './glance.ts'

describe('vendorProgress', () => {
  it('counts booked over every vendor still in play, leaving declined out of both', () => {
    expect(
      vendorProgress([
        { status: 'booked', count: 4 },
        { status: 'considering', count: 1 },
        { status: 'contacted', count: 1 },
        { status: 'quoted', count: 1 },
        { status: 'declined', count: 2 },
      ]),
    ).toEqual({ booked: 4, counted: 7 })
  })

  it('is zero of zero with no vendors, and with only declined ones', () => {
    expect(vendorProgress([])).toEqual({ booked: 0, counted: 0 })
    expect(vendorProgress([{ status: 'declined', count: 3 }])).toEqual({ booked: 0, counted: 0 })
  })
})
