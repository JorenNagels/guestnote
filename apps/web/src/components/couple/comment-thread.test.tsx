import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommentThread, type ThreadComment, type ThreadCopy } from './comment-thread.tsx'

const COPY: ThreadCopy = {
  empty: 'EMPTY',
  placeholder: 'WRITE',
  send: 'SEND',
  sending: 'SENDING',
  remove: 'DELETE',
  failed: 'FAILED',
  tooLong: 'TOO-LONG',
  couple: 'COUPLE',
}
const MINE: ThreadComment = {
  id: 'c1',
  author: 'Jij',
  byCouple: true,
  isOwn: true,
  body: 'Ja!',
  when: 'nu',
}
const THEIRS: ThreadComment = { ...MINE, id: 'c2', author: 'Ilse', byCouple: false, isOwn: false }

describe('CommentThread (spec 0008)', () => {
  it('marks couple comments and offers delete on own ones only', () => {
    render(<CommentThread comments={[MINE, THEIRS]} copy={COPY} add={vi.fn()} remove={vi.fn()} />)
    expect(screen.getAllByText('COUPLE')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'DELETE' })).toHaveLength(1)
  })

  it('sends the trimmed body, clears on success and says so on failure', async () => {
    const add = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const user = userEvent.setup()
    render(<CommentThread comments={[]} copy={COPY} add={add} />)
    expect(screen.getByText('EMPTY')).toBeInTheDocument()
    await user.type(screen.getByLabelText('WRITE'), '  mooi  ')
    await user.click(screen.getByRole('button', { name: 'SEND' }))
    expect(add).toHaveBeenCalledWith('mooi')
    expect(screen.getByLabelText('WRITE')).toHaveValue('')
    await user.type(screen.getByLabelText('WRITE'), 'nog')
    await user.click(screen.getByRole('button', { name: 'SEND' }))
    expect(await screen.findByText('FAILED')).toBeInTheDocument()
    expect(screen.getByLabelText('WRITE')).toHaveValue('nog')
  })

  it('read-only keeps the thread and drops the box and the deletes', () => {
    render(<CommentThread comments={[MINE]} copy={COPY} add={vi.fn()} remove={vi.fn()} readOnly />)
    expect(screen.getByText('Ja!')).toBeInTheDocument()
    expect(screen.queryByLabelText('WRITE')).toBeNull()
    expect(screen.queryByRole('button', { name: 'DELETE' })).toBeNull()
  })
})
