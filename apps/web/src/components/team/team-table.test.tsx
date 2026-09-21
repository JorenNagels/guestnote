import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type TeamRow, TeamTable, type TeamTableCopy } from './team-table.tsx'

const COPY: TeamTableCopy = {
  caption: 'Team members',
  member: 'Member',
  role: 'Role',
  seat: 'Seat',
  weddings: 'Assigned weddings',
  you: 'you',
  noWeddings: 'No wedding assigned yet',
}

const ROWS: TeamRow[] = [
  {
    userId: 'u1',
    name: 'Ilse Verhoeven',
    email: 'ilse@studio.be',
    initials: 'IV',
    roleLabel: 'Owner',
    seatLabel: 'Seat 1',
    weddings: ['All weddings'],
    isYou: true,
  },
  {
    userId: 'u2',
    name: 'els@studio.be',
    email: 'els@studio.be',
    initials: 'E',
    roleLabel: 'Team member',
    seatLabel: 'Seat 2',
    weddings: [],
    isYou: false,
  },
  {
    userId: 'u3',
    name: 'Tom Peeters',
    email: 'tom@studio.be',
    initials: 'TP',
    roleLabel: 'Team member',
    seatLabel: 'Seat 3',
    weddings: ['Anna & Jonas', 'Lies & Sven'],
    isYou: false,
  },
]

describe('TeamTable', () => {
  it('renders one row per person with static seat labels', () => {
    render(<TeamTable rows={ROWS} copy={COPY} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0] as HTMLElement).getByText('Seat 1')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('Seat 3')).toBeInTheDocument()
  })

  it('marks only the signed-in row as you', () => {
    render(<TeamTable rows={ROWS} copy={COPY} />)
    expect(screen.getAllByText('(you)')).toHaveLength(1)
    expect(within(screen.getAllByRole('row')[1] as HTMLElement).getByText('(you)')).toBeVisible()
  })

  it("lists a member's weddings, and says so when there are none", () => {
    render(<TeamTable rows={ROWS} copy={COPY} />)
    expect(screen.getByText('Anna & Jonas, Lies & Sven')).toBeInTheDocument()
    expect(screen.getByText('No wedding assigned yet')).toBeInTheDocument()
    expect(screen.getByText('All weddings')).toBeInTheDocument()
  })

  it('shows the email line once: not under a name that is already the email', () => {
    render(<TeamTable rows={ROWS} copy={COPY} />)
    expect(screen.getAllByText('els@studio.be')).toHaveLength(1)
    expect(screen.getAllByText('tom@studio.be')).toHaveLength(1)
  })
})
