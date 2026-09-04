// src/ui/useViewportScale.test.ts
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useViewportScale, viewportScale } from './useViewportScale'

const round3 = (value: number) => Math.round(value * 1000) / 1000

function resizeTo(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height })
}

afterEach(() => { resizeTo(1024, 768) })

describe('viewportScale', () => {
  it('is near the identity at the 1440x900 design size', () => {
    // the single gutter leaves a stage wider than the authored map, so the board scales up to fill it
    expect(viewportScale(1440, 900)).toEqual({ k: 1, s: round3(Math.min((1440 - 280) / 940, (900 - 156) / 698)) })
  })

  it('keeps the bars and side panel at their designed size and shrinks only the board', () => {
    // the heads-up display is not what zooms out: the window is smaller, so the camera moves away from the map
    const { k, s } = viewportScale(1280, 720)
    expect(k).toBe(1)
    expect(s).toBe(round3(Math.min((1280 - 280) / 940, (720 - 156) / 698)))
    expect(s).toBeLessThan(1)
  })

  it('never grows the bars, only the board', () => {
    const { k, s } = viewportScale(2560, 1440)
    expect(k).toBe(1)
    // min((2560-280)/940, (1440-156)/698) = min(2.426, 1.839)
    expect(s).toBeCloseTo(1.839, 2)
  })

  it('gives the chrome up only once the stage would fall below its minimum', () => {
    // 840x536 is the last size that still leaves a 560x380 stage at full size
    expect(viewportScale(840, 536).k).toBe(1)
    expect(viewportScale(600, 536).k).toBeLessThan(1)
    expect(viewportScale(840, 420).k).toBeLessThan(1)
  })

  it('never shrinks the bars below 0.55', () => {
    expect(viewportScale(400, 300).k).toBe(0.55)
  })

  it('rounds both factors to three decimals', () => {
    const { k, s } = viewportScale(1111, 777)
    expect(k).toBe(Math.round(k * 1000) / 1000)
    expect(s).toBe(Math.round(s * 1000) / 1000)
  })
})

describe('useViewportScale', () => {
  it('reads the current viewport', () => {
    resizeTo(1440, 900)
    const { result } = renderHook(() => useViewportScale())
    expect(result.current).toEqual({ k: 1, s: round3(Math.min((1440 - 280) / 940, (900 - 156) / 698)) })
  })

  it('follows a resize', () => {
    resizeTo(1440, 900)
    const { result } = renderHook(() => useViewportScale())
    expect(result.current.k).toBe(1)
    act(() => {
      resizeTo(800, 520)
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.k).toBeLessThan(1)
  })
})
