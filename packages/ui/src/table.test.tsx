import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Table, TableBody, TableCell, TableFoot, TableHead, TableHeaderCell } from './table.tsx'

function Sample() {
  return (
    <Table caption="Payment schedule">
      <TableHead>
        <tr>
          <TableHeaderCell>Payee</TableHeaderCell>
          <TableHeaderCell numeric>Amount</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        <tr>
          <TableCell>Florist</TableCell>
          <TableCell numeric>€ 1.200</TableCell>
        </tr>
        <tr>
          <TableCell>Caterer</TableCell>
          <TableCell numeric>€ 8.400</TableCell>
        </tr>
      </TableBody>
      <TableFoot>
        <tr>
          <TableCell>Total</TableCell>
          <TableCell numeric>€ 9.600</TableCell>
        </tr>
      </TableFoot>
    </Table>
  )
}

describe('Table', () => {
  it('is a table named by its caption', () => {
    render(<Sample />)
    expect(screen.getByRole('table', { name: 'Payment schedule' })).toBeInTheDocument()
  })

  it('gives header cells column scope, so cells are announced with their header', () => {
    render(<Sample />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual(['Payee', 'Amount'])
    for (const h of headers) expect(h).toHaveAttribute('scope', 'col')
  })

  it('lets a header cell override the scope for a row header', () => {
    render(
      <Table caption="t">
        <TableBody>
          <tr>
            <TableHeaderCell scope="row">Florist</TableHeaderCell>
          </tr>
        </TableBody>
      </Table>,
    )
    expect(screen.getByRole('rowheader', { name: 'Florist' })).toBeInTheDocument()
  })

  it('renders head, body and foot rows in order', () => {
    render(<Sample />)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[3] as HTMLElement).getByText('Total')).toBeInTheDocument()
  })

  it('marks numeric cells with the num class that tokens.css aligns and tabulates', () => {
    render(<Sample />)
    expect(screen.getByRole('cell', { name: '€ 1.200' })).toHaveClass('num')
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveClass('num')
    expect(screen.getByRole('cell', { name: 'Florist' })).not.toHaveClass('num')
  })

  it('passes a caller className through instead of replacing the base classes', () => {
    render(
      <Table caption="t" className="min-w-[40rem]">
        <TableBody>
          <tr>
            <TableCell className="w-40">x</TableCell>
          </tr>
        </TableBody>
      </Table>,
    )
    expect(screen.getByRole('table')).toHaveClass('min-w-[40rem]')
    expect(screen.getByRole('table').className.split(' ').length).toBeGreaterThan(1)
    expect(screen.getByRole('cell')).toHaveClass('w-40')
    expect(screen.getByRole('cell').className.split(' ').length).toBeGreaterThan(1)
  })
})
