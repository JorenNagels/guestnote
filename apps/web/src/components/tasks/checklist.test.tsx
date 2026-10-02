import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Filter } from './buckets.ts'
import { task } from './fixture.ts'
import { WithMessages } from './intl.test-util.tsx'

vi.mock('../../app/pro/(app)/weddings/[id]/tasks/actions.ts', () => ({
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  setTaskDoneAction: vi.fn(),
}))

const { Checklist } = await import('./checklist.tsx')

const TODAY = '2027-03-10'
const ME = '018f0000-0000-7000-8000-0000000000d1'
const BEN = '018f0000-0000-7000-8000-0000000000d2'
const show = (tasks: ReturnType<typeof task>[], filter: Filter = 'all') =>
  render(
    <WithMessages>
      <Checklist
        weddingId="w1"
        weddingDate="2027-06-12"
        staff={[
          { id: ME, name: 'Anna' },
          { id: BEN, name: 'Ben' },
        ]}
        viewerId={ME}
        tasks={tasks}
        filter={filter}
        today={TODAY}
      />
    </WithMessages>,
  )

const many = [
  task({ id: '1', title: 'Late one', dueDate: '2027-03-01' }),
  task({ id: '2', title: 'Soon one', dueDate: '2027-03-12', visibility: 'internal' }),
  task({ id: '3', title: 'Later one', dueDate: '2027-08-01' }),
  task({ id: '4', title: 'Undated one', dueDate: null }),
  task({ id: '5', title: 'Finished one', status: 'done', dueDate: '2027-03-12' }),
]

describe('Checklist', () => {
  it('groups by bucket in order and skips empty buckets', () => {
    show(many.slice(0, 2))
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Te laat',
      'Komende 14 dagen',
    ])
  })

  it('draws every bucket when every one has a task', () => {
    show(many)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Te laat',
      'Komende 14 dagen',
      'Later',
      'Zonder datum',
      'Afgerond',
    ])
  })

  it('counts the whole wedding in each pill, and marks the active one', () => {
    show(many, 'internal')
    const nav = screen.getByRole('navigation', { name: 'Filter' })
    expect(within(nav).getByRole('link', { name: /Alles/ })).toHaveTextContent('5')
    expect(within(nav).getByRole('link', { name: /Open/ })).toHaveTextContent('4')
    expect(within(nav).getByRole('link', { name: /Te laat/ })).toHaveTextContent('1')
    expect(within(nav).getByRole('link', { name: /Intern/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /Alles/ })).not.toHaveAttribute('aria-current')
  })

  it('keeps the filter in the URL', () => {
    show(many)
    const nav = screen.getByRole('navigation', { name: 'Filter' })
    expect(within(nav).getByRole('link', { name: /Alles/ })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks',
    )
    expect(within(nav).getByRole('link', { name: /Gedeeld/ })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks?filter=shared',
    )
  })

  it('shows only what the filter matches', () => {
    show(many, 'internal')
    expect(screen.getByText('Soon one')).toBeInTheDocument()
    expect(screen.queryByText('Late one')).toBeNull()
  })

  it('says so, with a way back, when the filter matches nothing', () => {
    show(many.slice(1, 2), 'overdue')
    expect(screen.getByText('Geen taken voor dit filter')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Toon alles' })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks',
    )
  })

  it('points the empty state at the quick-add line, with no second button', () => {
    show([])
    expect(screen.getByText('Nog geen taken')).toBeInTheDocument()
    expect(screen.getByText(/Typ hierboven je eerste taak/)).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Taak toevoegen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nieuwe taak' })).toBeNull()
  })

  it('opens the full form from "Meer opties" with the typed title, and gives it back on cancel', () => {
    show(many)
    fireEvent.change(screen.getByRole('textbox', { name: 'Taak toevoegen' }), {
      target: { value: 'Book the DJ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Meer opties…' }))
    expect(screen.getByRole('form', { name: 'Nieuwe taak' })).toBeInTheDocument()
    expect(screen.getByLabelText('Taak')).toHaveValue('Book the DJ')
    expect(screen.queryByRole('form', { name: 'Taak toevoegen' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(screen.queryByRole('form', { name: 'Nieuwe taak' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Taak toevoegen' })).toHaveValue('Book the DJ')
  })

  describe('Mijn taken (spec 0009 C1)', () => {
    const team = [
      task({ id: 'm1', title: 'Mine open', assigneeUserId: ME }),
      task({ id: 'm2', title: 'Mine done', assigneeUserId: ME, status: 'done' }),
      task({ id: 'b1', title: 'Ben open', assigneeUserId: BEN }),
      task({ id: 'c1', title: 'Couple open', assigneeRole: 'couple', assigneeUserId: null }),
    ]

    it("shows only the viewer's own tasks, done ones included, and counts them", () => {
      show(team, 'mine')
      const nav = screen.getByRole('navigation', { name: 'Filter' })
      const mine = within(nav).getByRole('link', { name: /Mijn taken/ })
      expect(mine).toHaveTextContent('2')
      expect(mine).toHaveAttribute('aria-current', 'page')
      expect(mine).toHaveAttribute('href', '/weddings/w1/tasks?filter=mine')
      expect(screen.getByText('Mine open')).toBeInTheDocument()
      expect(screen.getByText('Mine done')).toBeInTheDocument()
      expect(screen.queryByText('Ben open')).toBeNull()
      expect(screen.queryByText('Couple open')).toBeNull()
    })

    it('counts the viewer only, whichever filter is open', () => {
      show(team)
      const nav = screen.getByRole('navigation', { name: 'Filter' })
      expect(within(nav).getByRole('link', { name: /Mijn taken/ })).toHaveTextContent('2')
      expect(within(nav).getByRole('link', { name: /Alles/ })).toHaveTextContent('4')
    })

    it('starts the full form on the viewer, from the team it was given', () => {
      show(team)
      fireEvent.click(screen.getByRole('button', { name: 'Meer opties…' }))
      expect(screen.getByRole('radio', { name: 'Anna (jij)' })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'Ben' })).not.toBeChecked()
    })
  })

  it('opens a task beside the list, keeping the filter', () => {
    show(many, 'internal')
    expect(screen.getByRole('link', { name: /Soon one/ })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks?filter=internal&task=2',
    )
  })

  it('leaves the default filter out of a row link', () => {
    show(many)
    expect(screen.getByRole('link', { name: /Late one/ })).toHaveAttribute(
      'href',
      '/weddings/w1/tasks?task=1',
    )
  })
})
