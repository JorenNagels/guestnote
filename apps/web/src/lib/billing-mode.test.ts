import { describe, expect, it, vi } from 'vitest'

const env: { billingFrom: string | undefined } = { billingFrom: undefined }
vi.mock('../env.ts', () => ({ env }))

const { billingMode, resolveBillingMode } = await import('./billing-mode.ts')

describe('resolveBillingMode', () => {
  it('is the demo when the variable is unset -- the safe value by omission', () => {
    expect(resolveBillingMode(undefined)).toEqual({ on: false })
  })

  it('is on from the given civil date', () => {
    expect(resolveBillingMode('2026-11-01')).toEqual({ on: true, from: '2026-11-01' })
  })

  it('refuses a date that has the shape and does not exist, rather than falling back to demo', () => {
    expect(() => resolveBillingMode('2026-02-31')).toThrow(/not a real date/)
    expect(() => resolveBillingMode('2026-13-01')).toThrow(/not a real date/)
  })
})

describe('billingMode', () => {
  it('reads the environment -- demo unset, on once a date is given', () => {
    env.billingFrom = undefined
    expect(billingMode()).toEqual({ on: false })
    env.billingFrom = '2026-11-01'
    expect(billingMode()).toEqual({ on: true, from: '2026-11-01' })
  })
})
