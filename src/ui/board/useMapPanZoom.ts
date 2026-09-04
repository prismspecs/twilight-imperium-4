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
  onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 3.0
// R3.2: below this, an ordinary mouse or trackpad click reads as a few pixels of pointer drift and the
// click-vs-pan disambiguation below would eat the click meant for a tile, with no on-screen feedback at
// all - the tactical action button stays highlighted and nothing else happens.
const DRAG_THRESHOLD = 12

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
  const justDraggedRef = useRef<boolean>(false)

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
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }

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
    if (dragStartRef.current?.moved) {
      justDraggedRef.current = true
      setTimeout(() => {
        justDraggedRef.current = false
      }, 50)
    }
    dragStartRef.current = null
    setIsDragging(false)
  }, [])

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (justDraggedRef.current) {
      e.stopPropagation()
      e.preventDefault()
    }
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
      if (dragStartRef.current?.moved) {
        justDraggedRef.current = true
        setTimeout(() => {
          justDraggedRef.current = false
        }, 50)
      }
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
    onClickCapture,
    onWheel,
  }
}
