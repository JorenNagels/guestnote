import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { COLOR_PRESETS, ColorPicker, normalizeHex, parseHexInput } from './color-picker.tsx'

function setup(value: string | null = null) {
  const onChange = vi.fn()
  render(
    <ColorPicker
      label="Wedding colour"
      customLabel="Other colour"
      hexLabel="Hex code"
      value={value}
      onChange={onChange}
    />,
  )
  return onChange
}

describe('COLOR_PRESETS', () => {
  it('are uppercase #RRGGBB, so they can go to the server as they are', () => {
    expect(COLOR_PRESETS.length).toBeGreaterThan(0)
    for (const hex of COLOR_PRESETS) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('has no duplicates', () => {
    expect(new Set(COLOR_PRESETS).size).toBe(COLOR_PRESETS.length)
  })
})

describe('normalizeHex', () => {
  it('upper-cases a valid colour', () => {
    expect(normalizeHex('#12ab9f')).toBe('#12AB9F')
    expect(normalizeHex('#12AB9F')).toBe('#12AB9F')
  })

  it('refuses everything else instead of guessing', () => {
    for (const bad of ['', '12ab9f', '#abc', '#12ab9', '#12ab9fg', '#12ab9f0', 'red']) {
      expect(normalizeHex(bad)).toBeNull()
    }
  })
})

describe('parseHexInput', () => {
  it('takes what a person pastes: with or without #, any case, stray whitespace', () => {
    expect(parseHexInput('12ab9f')).toBe('#12AB9F')
    expect(parseHexInput('#12AB9F')).toBe('#12AB9F')
    expect(parseHexInput('  #12ab9f \n')).toBe('#12AB9F')
  })

  it('expands CSS shorthand, which a person types and the native input never does', () => {
    expect(parseHexInput('#abc')).toBe('#AABBCC')
    expect(parseHexInput('f0a')).toBe('#FF00AA')
  })

  it('refuses everything else', () => {
    for (const bad of ['', '#', '12ab9', '#12ab9fg', '##12ab9f', '12 ab 9f', 'red', 'rgb(1,2,3)']) {
      expect(parseHexInput(bad)).toBeNull()
    }
  })
})

// A controlled harness, so the hex field's mirror of the value can be watched changing.
function Controlled({ initial = null as string | null, onChange = (_: string) => {} }) {
  const [value, setValue] = useState(initial)
  return (
    <ColorPicker
      label="Wedding colour"
      customLabel="Other colour"
      hexLabel="Hex code"
      value={value}
      onChange={(hex) => {
        setValue(hex)
        onChange(hex)
      }}
    />
  )
}

describe('ColorPicker hex field', () => {
  it('shows the current colour without its #, and nothing when unset', () => {
    setup('#12ab9f')
    expect(screen.getByRole('textbox', { name: 'Hex code' })).toHaveValue('12AB9F')
  })

  it('is empty when there is no value', () => {
    setup(null)
    expect(screen.getByRole('textbox', { name: 'Hex code' })).toHaveValue('')
  })

  it('emits as soon as six digits are typed, and not on the shorthand on the way there', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    // "12a" is valid shorthand; emitting it would flash #1122AA mid-typing.
    await user.type(screen.getByRole('textbox', { name: 'Hex code' }), '12ab9')
    expect(onChange).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Hex code' }), 'f')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('#12AB9F')
  })

  it('a paste replaces the field instead of inserting into the colour already there', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={COLOR_PRESETS[0]} onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'Hex code' })
    await user.click(field)
    await user.paste(' #a94f4a ')
    expect(onChange).toHaveBeenLastCalledWith('#A94F4A')
    expect(field).toHaveValue('A94F4A')
  })

  it('marks what does not parse once there is something in it, and emits nothing', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    const field = screen.getByRole('textbox', { name: 'Hex code' })
    expect(field).not.toHaveAttribute('aria-invalid')
    await user.type(field, 'zz')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    await user.tab()
    // Still marked after leaving: an invalid entry stays visible instead of snapping back.
    expect(field).toHaveValue('zz')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits shorthand when the field is left, in the stored spelling', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'Hex code' })
    await user.type(field, 'abc')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onChange).toHaveBeenCalledWith('#AABBCC')
    expect(field).toHaveValue('AABBCC')
  })

  it('follows a swatch click, even over a half-typed entry', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const field = screen.getByRole('textbox', { name: 'Hex code' })
    await user.type(field, '12')
    await user.click(screen.getByRole('radio', { name: COLOR_PRESETS[3] }))
    expect(field).toHaveValue(COLOR_PRESETS[3].slice(1))
    expect(field).not.toHaveAttribute('aria-invalid')
  })
})

describe('ColorPicker custom swatch', () => {
  it('fills with the custom colour when one is chosen', () => {
    setup('#12AB9F')
    expect(screen.getByTestId('custom-swatch')).toHaveStyle({ backgroundColor: '#12AB9F' })
  })

  it('stays an empty "add" slot when the value is a preset or unset', () => {
    setup(COLOR_PRESETS[0])
    expect(screen.getByTestId('custom-swatch').getAttribute('style')).toBeNull()
  })

  it('carries its name as a hover title, so the slot explains itself to a mouse', () => {
    setup()
    expect(screen.getByTitle('Other colour')).toContainElement(
      screen.getByLabelText('Other colour'),
    )
  })
})

describe('ColorPicker', () => {
  it('is a named group of radios, one per preset, plus a named colour input', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Wedding colour' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(COLOR_PRESETS.length)
    expect(screen.getByLabelText('Other colour')).toHaveAttribute('type', 'color')
  })

  it('names each swatch by its hex unless the caller says otherwise', () => {
    setup()
    for (const hex of COLOR_PRESETS) {
      expect(screen.getByRole('radio', { name: hex })).toBeInTheDocument()
    }
  })

  it('uses the swatchLabel names when given', () => {
    render(
      <ColorPicker
        label="Colour"
        customLabel="Other"
        hexLabel="Hex"
        value={null}
        onChange={() => {}}
        swatchLabel={(hex) => (hex === COLOR_PRESETS[0] ? 'Teal' : hex)}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeInTheDocument()
  })

  it('checks nothing when there is no value', () => {
    setup(null)
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })

  it('checks the preset that matches the value, in any case', () => {
    setup(COLOR_PRESETS[2].toLowerCase())
    expect(screen.getByRole('radio', { name: COLOR_PRESETS[2] })).toBeChecked()
    expect(
      screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked),
    ).toHaveLength(1)
  })

  it('emits the preset as uppercase #RRGGBB when clicked', async () => {
    const user = userEvent.setup()
    const onChange = setup()
    await user.click(screen.getByRole('radio', { name: COLOR_PRESETS[1] }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(COLOR_PRESETS[1])
  })

  it('is one tab stop, and arrow keys move to the next swatch and emit it', async () => {
    const user = userEvent.setup()
    const onChange = setup(COLOR_PRESETS[0])
    await user.tab()
    expect(screen.getByRole('radio', { name: COLOR_PRESETS[0] })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: COLOR_PRESETS[1] })).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith(COLOR_PRESETS[1])
    // The next Tab leaves the swatches for the colour input: one stop for the whole row.
    await user.tab()
    expect(screen.getByLabelText('Other colour')).toHaveFocus()
  })

  it('emits a custom colour as uppercase, though the native input reports lowercase', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText('Other colour'), { target: { value: '#12ab9f' } })
    expect(onChange).toHaveBeenCalledWith('#12AB9F')
  })

  it('shows a custom value in the colour input and checks no swatch', () => {
    setup('#12AB9F')
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
    // Native colour inputs want lowercase; anything else would silently become black.
    // CANNOT DISCRIMINATE: jsdom runs the spec's value-sanitization algorithm, which
    // lowercases a colour input's value itself, so removing the `.toLowerCase()` in the
    // component still passes here. Measured by mutation on 2026-09-21. It matters in a
    // real browser only, where this needs a Playwright check once there is one.
    expect(screen.getByLabelText('Other colour')).toHaveValue('#12ab9f')
  })

  it('treats an invalid value as unset instead of throwing', () => {
    setup('not-a-colour')
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })
})
