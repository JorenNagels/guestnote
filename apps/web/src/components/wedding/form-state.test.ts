import { describe, expect, it } from 'vitest'
import { canCreateWedding, echoValues } from './form-state.ts'

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

describe('echoValues', () => {
  it('echoes the named string fields and drops a file', () => {
    const fd = new FormData()
    fd.set('a', 'x')
    fd.set('b', new File(['x'], 'x.txt'))
    fd.set('c', 'not asked for')
    expect(echoValues(fd, ['a', 'b', 'missing'])).toEqual({ a: 'x' })
  })
})
