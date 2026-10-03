import { ALLOWED_CONTENT_TYPES, INLINE_CONTENT_TYPES } from '@guestnote/storage'
import { describe, expect, it } from 'vitest'
import { BOARD_ACCEPT, BOARD_TYPES, INLINE_TYPES, isImageType, opensInTab } from './board-items.ts'

describe('board items', () => {
  // The client copies exist only because the package's entry point drags the S3 SDK into a client
  // bundle. If the storage lists change, these must change with them, or the picker hides a type
  // the server takes, or a PDF is saved where it should open.
  it('match @guestnote/storage exactly', () => {
    expect([...BOARD_TYPES].sort()).toEqual([...ALLOWED_CONTENT_TYPES.image].sort())
    expect([...INLINE_TYPES].sort()).toEqual([...INLINE_CONTENT_TYPES].sort())
  })

  it('offers PDF and Office files in the picker, and never SVG or HTML', () => {
    const accept = BOARD_ACCEPT.split(',')
    expect(accept).toContain('application/pdf')
    expect(accept).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(accept).not.toContain('image/svg+xml')
    expect(accept).not.toContain('text/html')
  })

  it('opens an image or a PDF in a tab and saves an Office file', () => {
    expect(opensInTab('application/pdf')).toBe(true)
    expect(opensInTab('image/jpeg')).toBe(true)
    expect(opensInTab('application/msword')).toBe(false)
    expect(opensInTab('text/html')).toBe(false)
  })

  it('draws only images as images', () => {
    expect(isImageType('image/heic')).toBe(true)
    expect(isImageType('application/pdf')).toBe(false)
  })
})
