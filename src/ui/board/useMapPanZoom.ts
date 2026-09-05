import { useCallback, useEffect, useRef, useState } from 'react'

export interface PanZoomState {
  pan: { x: number; y: number }
  zoom: number
  isDragging: boolean
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 3.0
// How far the pointer must travel before a hold-and-move starts panning the map, rather than being read
// as a click. Cancelling a tile's own click after a pan used to be this hook's job too (a shared "just
// panned" flag plus a capture-phase listener), but that meant every click anywhere on the map raced a
// 50ms window regardless of where it landed. Tile.tsx now makes that call itself, from its own pointerdown
// origin (AsyncTI4/ti4_web_new's SystemHexTarget.tsx pattern) - this threshold is only about when panning
// itself should start.
/**
 * How far the pointer must travel before a hold-and-move pans the map.
 *
 * This is not a comfort setting, it decides whether a tile click happens at all. A `click` only fires when
 * mousedown and mouseup land on the same element. Real mouse and trackpad hardware always drifts a few
 * pixels during an ordinary click; a scripted click never does. So while this sat at 5px, an ordinary click
 * panned the board by those few pixels, the tile slid out from under the cursor, mouseup landed on a
 * different element, and the browser fired no click event at all - the tile's own handler never ran and
 * there was nothing to debug. Keyboard activation (Tab then Space) still worked, which is the tell.
 *
 * Keep this comfortably above ordinary click jitter, and at or below Tile.tsx's CLICK_DRAG_TOLERANCE so a
 * gesture that was too small to pan is never then rejected as a drag by the tile.
 */
const DRAG_THRESHOLD = 14

export function useMapPanZoom(): PanZoomState {
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState<number>(1)
  const [isDragging, setIsDragging] = useState<boolean>(false)

  const dragStartRef = useRef<{
    startX: number
    startY: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)

  const activePointerIdRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, Math.round((z + 0.2) * 10) / 10))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, Math.round((z - 0.2) * 10) / 10))
  }, [])

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary left or middle buttons
    if (e.button !== 0 && e.button !== 1) return
    if (activePointerIdRef.current !== null) return
    // Don't drag if clicking buttons, inputs, controls, etc.
    const target = e.target as HTMLElement | null
    if (target?.closest('button, input, select, .map-controls')) return

    if (e.button === 1) e.preventDefault()
    activePointerIdRef.current = e.pointerId
    // Deliberately NOT capturing the pointer here. Once a pointer is captured, the browser dispatches the
    // subsequent `click` to the capture target (this viewport) instead of the element that was actually
    // pressed, so a tile's own onClick never fires and clicking a tile does nothing at all - while Tab and
    // Space still work, because keyboard activation never goes near pointer capture. Capture is taken in
    // onPointerMove instead, once the gesture has actually become a drag; a plain click never captures.
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    }
  }, [pan])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || activePointerIdRef.current !== e.pointerId) return
    const dx = e.clientX - dragStartRef.current.startX
    const dy = e.clientY - dragStartRef.current.startY
    if (!dragStartRef.current.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      dragStartRef.current.moved = true
      setIsDragging(true)
      // now that this is a real drag and not a click, capture the pointer so the pan keeps following it even
      // when it leaves the viewport. Capturing here rather than on pointerdown is what keeps a plain click's
      // `click` event targeted at the tile instead of being retargeted to this viewport.
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        // ignore
      }
    }
    if (dragStartRef.current.moved) {
      const nextX = dragStartRef.current.panX + dx
      const nextY = dragStartRef.current.panY + dy
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          setPan({ x: nextX, y: nextY })
          rafIdRef.current = null
        })
      }
    }
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null && activePointerIdRef.current === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId)
      } catch {
        // ignore
      }
      activePointerIdRef.current = null
    }
    dragStartRef.current = null
    setIsDragging(false)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Zoom in on negative delta, out on positive
    const factor = e.deltaY < 0 ? 1.12 : 0.89
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * factor * 100) / 100)))
  }, [])

  // Clear drag state if window loses focus or pointer is released globally
  useEffect(() => {
    const handleGlobalUp = () => {
      activePointerIdRef.current = null
      dragStartRef.current = null
      setIsDragging(false)
    }
    window.addEventListener('pointerup', handleGlobalUp)
    return () => {
      window.removeEventListener('pointerup', handleGlobalUp)
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  return {
    pan,
    zoom,
    isDragging,
    zoomIn,
    zoomOut,
    resetView,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  }
}
