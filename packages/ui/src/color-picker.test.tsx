import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { COLOR_PRESETS, ColorPicker, normalizeHex } from './color-picker.tsx'

function setup(value: string | null = null) {
  const onChange = vi.fn()
  render(
    <ColorPicker
      label="Wedding colour"
      customLabel="Other colour"
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
