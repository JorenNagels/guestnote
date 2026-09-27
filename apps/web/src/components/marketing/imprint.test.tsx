import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { completeOperator, OPERATOR, type Operator } from '../../lib/operator.ts'
import { Imprint } from './imprint.tsx'

const LABELS = {
  name: 'Naam',
  tradeName: 'Handelsnaam',
  form: 'Rechtsvorm',
  formValue: 'Eenmanszaak',
  address: 'Adres',
  kbo: 'Ondernemingsnummer',
  vat: 'Btw',
  vatExempt: 'Vrijgesteld van btw',
  email: 'E-mail',
}

const FILLED: Operator = {
  ...OPERATOR,
  name: 'An Example',
  address: 'Voorbeeldstraat 1, 9000 Gent',
  kbo: '0123.456.789',
  vat: 'BE0123456789',
}

describe('completeOperator', () => {
  it('is null while any legally required field is unset', () => {
    expect(completeOperator(FILLED)).not.toBeNull()
    expect(completeOperator({ ...FILLED, name: null })).toBeNull()
    expect(completeOperator({ ...FILLED, address: null })).toBeNull()
    expect(completeOperator({ ...FILLED, kbo: null })).toBeNull()
    expect(completeOperator({ ...FILLED, vat: null })).toBeNull()
  })
})

describe('Imprint', () => {
  it('renders nothing for an incomplete operator, in either variant', () => {
    const { container } = render(
      <>
        <Imprint operator={null} labels={LABELS} variant="line" />
        <Imprint operator={null} labels={LABELS} variant="list" />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names every element WER art. XII.6 requires, in the footer line', () => {
    render(<Imprint operator={completeOperator(FILLED)} labels={LABELS} variant="line" />)
    const line = screen.getByTestId('imprint-line').textContent ?? ''
    for (const part of [
      'An Example',
      'Eenmanszaak',
      'Voorbeeldstraat 1',
      '0123.456.789',
      'BE0123456789',
    ]) {
      expect(line).toContain(part)
    }
  })

  it('says "exempt" in words in the footer line too', () => {
    // The line is on every page, so it is where a leaked sentinel would be seen.
    render(
      <Imprint
        operator={completeOperator({ ...FILLED, vat: 'exempt' })}
        labels={LABELS}
        variant="line"
      />,
    )
    const line = screen.getByTestId('imprint-line').textContent ?? ''
    expect(line).toContain('Vrijgesteld van btw')
    expect(line).not.toContain('exempt')
    expect(line).toContain('Guestnote')
    expect(line).toContain('Ondernemingsnummer')
  })

  it('says "exempt" in words, never the sentinel', () => {
    render(
      <Imprint
        operator={completeOperator({ ...FILLED, vat: 'exempt' })}
        labels={LABELS}
        variant="list"
      />,
    )
    const list = screen.getByTestId('imprint-list').textContent ?? ''
    expect(list).toContain('Vrijgesteld van btw')
    expect(list).not.toContain('exempt')
    expect(list).toContain('hello@guestnote.be')
  })
})
