import { describe, expect, it } from 'vitest'
import { canCreateWedding, echoValues, isUuid } from './form-state.ts'

const m = (role: 'owner' | 'admin' | 'member', orgId = 'o1') => ({
  userId: 'u',
  orgs: [{ orgId, role }],
  weddings: [],
})

describe('canCreateWedding', () => {
  it('is owner and admin, in that organisation only', () => {
    expect(canCreateWedding(m('owner'), 'o1')).toBe(true)
    expect(canCreateWedding(m('admin'), 'o1')).toBe(true)
    expect(canCreateWedding(m('member'), 'o1')).toBe(false)
    expect(canCreateWedding(m('owner', 'o2'), 'o1')).toBe(false)
    expect(
      canCreateWedding(
        { userId: 'u', orgs: [], weddings: [{ weddingId: 'w', role: 'editor' }] },
        'o1',
      ),
    ).toBe(false)
  })
})

describe('isUuid', () => {
  it('accepts a uuid and nothing else', () => {
    expect(isUuid('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true)
    expect(isUuid('0190a1b2c3d47e5f8a9b0c1d2e3f4a5b')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid("' or 1=1 --")).toBe(false)
  })
})

describe('echoValues', () => {
  it('echoes the named string fields and drops a file', () => {
    const fd = new FormData()
    fd.set('a', 'x')
    fd.set('b', new File(['x'], 'x.txt'))
    fd.set('c', 'not asked for')
    expect(echoValues(fd, ['a', 'b', 'missing'])).toEqual({ a: 'x' })
  })
})
