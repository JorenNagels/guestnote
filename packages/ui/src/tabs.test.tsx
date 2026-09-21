import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Tabs } from './tabs.tsx'

const items = [
  { value: 'all', label: 'All', count: 12, panel: <p>everything</p> },
  { value: 'mine', label: 'Mine', panel: <p>just mine</p> },
  { value: 'late', label: 'Overdue', count: 0, panel: <p>the late ones</p> },
]

describe('Tabs', () => {
  it('exposes a named tablist, tabs and the selected tab with its panel', () => {
    render(<Tabs label="Filters" items={items} />)
    const list = screen.getByRole('tablist', { name: 'Filters' })
    expect(list).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    const all = screen.getByRole('tab', { name: /All/ })
    expect(all).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('everything')
    expect(panel).toHaveAccessibleName(/All/)
    expect(all).toHaveAttribute('aria-controls', panel.id)
  })

  it('shows a count, including zero, and nothing when the count is omitted', () => {
    render(<Tabs label="Filters" items={items} />)
    // `\s*` because jsdom's name computation joins a flex item's text without the space a
    // browser inserts when it blockifies the children.
    expect(screen.getByRole('tab', { name: /^All\s*12$/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Overdue\s*0$/ })).toBeInTheDocument()
    // Its own element: `count && <Badge/>` would render a bare "0" text node in the
    // button, which the name check above cannot tell apart, but this lookup cannot find.
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Mine' })).toBeInTheDocument()
  })

  it('selects on click and mounts only the selected panel', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Tabs label="Filters" items={items} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('tab', { name: 'Mine' }))
    expect(onValueChange).toHaveBeenCalledWith('mine')
    expect(screen.getByRole('tab', { name: 'Mine' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('just mine')
    expect(screen.queryByText('everything')).toBeNull()
  })

  it('has one tab stop: only the selected tab is tabbable', () => {
    render(<Tabs label="Filters" items={items} />)
    const [first, second, third] = screen.getAllByRole('tab')
    expect(first).toHaveAttribute('tabindex', '0')
    expect(second).toHaveAttribute('tabindex', '-1')
    expect(third).toHaveAttribute('tabindex', '-1')
  })

  it('moves and selects with the arrow keys, wrapping at both ends', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Filters" items={items} />)
    await user.tab()
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Mine' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Mine' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: /Overdue/ })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('the late ones')
  })

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Filters" items={items} defaultValue="mine" />)
    await user.tab()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /Overdue/ })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus()
  })

  it('follows a controlled value and only reports the change', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Tabs label="Filters" items={items} value="mine" onValueChange={onValueChange} />)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('just mine')
    await user.click(screen.getByRole('tab', { name: /Overdue/ }))
    expect(onValueChange).toHaveBeenCalledWith('late')
    // The parent has not accepted the change, so the selection has not moved.
    expect(screen.getByRole('tab', { name: 'Mine' })).toHaveAttribute('aria-selected', 'true')
  })

  it('works when the parent holds the state', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [v, setV] = useState('all')
      return <Tabs label="Filters" items={items} value={v} onValueChange={setV} />
    }
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: /Overdue/ }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('the late ones')
  })

  it('keeps a tab stop when the value names no tab', () => {
    render(<Tabs label="Filters" items={items} value="gone" />)
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('tabindex', '0')
    expect(screen.queryByRole('tabpanel')).toBeNull()
  })

  it('renders no panel when the caller owns the content', () => {
    render(<Tabs label="Filters" items={[{ value: 'a', label: 'A' }]} />)
    expect(screen.queryByRole('tabpanel')).toBeNull()
    expect(screen.getByRole('tab', { name: 'A' })).not.toHaveAttribute('aria-controls')
  })
})
