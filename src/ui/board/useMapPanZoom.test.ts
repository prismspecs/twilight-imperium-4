// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMapPanZoom } from './useMapPanZoom'

describe('useMapPanZoom', () => {
  it('starts at default pan (0,0) and zoom 1.0', () => {
    const { result } = renderHook(() => useMapPanZoom())
    expect(result.current.pan).toEqual({ x: 0, y: 0 })
    expect(result.current.zoom).toBe(1)
    expect(result.current.isDragging).toBe(false)
  })

  it('zooms in and out within clamp bounds [0.4, 3.0]', () => {
    const { result } = renderHook(() => useMapPanZoom())
    act(() => result.current.zoomIn())
    expect(result.current.zoom).toBe(1.2)
    act(() => result.current.zoomOut())
    expect(result.current.zoom).toBe(1.0)

    // Zoom out to min bound
    for (let i = 0; i < 10; i++) act(() => result.current.zoomOut())
    expect(result.current.zoom).toBe(0.4)

    // Zoom in to max bound
    for (let i = 0; i < 20; i++) act(() => result.current.zoomIn())
    expect(result.current.zoom).toBe(3.0)

    // Reset view
    act(() => result.current.resetView())
    expect(result.current.zoom).toBe(1)
    expect(result.current.pan).toEqual({ x: 0, y: 0 })
  })

  it('responds to wheel zoom events', () => {
    const { result } = renderHook(() => useMapPanZoom())
    act(() => {
      result.current.onWheel({ deltaY: -100 } as React.WheelEvent<HTMLDivElement>)
    })
    expect(result.current.zoom).toBeGreaterThan(1.0)

    act(() => {
      result.current.onWheel({ deltaY: 100 } as React.WheelEvent<HTMLDivElement>)
    })
    expect(result.current.zoom).toBeLessThanOrEqual(1.15)
  })
})
