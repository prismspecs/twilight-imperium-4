// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { getStyle, setStyle, useModelStyle } from './modelStyle'

function Probe() {
  const { style } = useModelStyle()
  return <div data-testid="style">{style}</div>
}

it('the unit-art style is one shared store: a change from any surface re-renders every consumer', () => {
  setStyle('models')
  const view = render(<Probe />)
  expect(screen.getByTestId('style').textContent).toBe('models')
  act(() => { setStyle('studio') })
  expect(screen.getByTestId('style').textContent).toBe('studio')
  expect(getStyle()).toBe('studio')
  view.unmount()
})
