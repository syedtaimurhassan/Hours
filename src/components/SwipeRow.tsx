import { useRef, useState } from 'react'

const DELETE_W = 96

/**
 * iOS-style swipe-left-to-delete wrapper for a list row (the pattern Clockify,
 * Harvest, etc. use for time entries). `touch-action: pan-y` lets the page
 * scroll vertically while we own horizontal drags. Reveals a red Delete that
 * must be tapped to confirm — no accidental full-swipe deletion.
 */
export function SwipeRow({
  children,
  onDelete,
  disabled,
}: {
  children: React.ReactNode
  onDelete: () => void
  disabled?: boolean
}) {
  const [tx, setTx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const openRef = useRef(false)
  const movedRef = useRef(false) // a horizontal drag happened this gesture
  const start = useRef({ x: 0, y: 0 })
  const axis = useRef<'x' | 'y' | null>(null)
  const activeRef = useRef(false)

  const close = () => {
    openRef.current = false
    setTx(0)
  }

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return
    activeRef.current = true
    axis.current = null
    movedRef.current = false
    start.current = { x: e.clientX, y: e.clientY }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!activeRef.current || disabled) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (axis.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') {
        movedRef.current = true
        setDragging(true)
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      }
    }
    if (axis.current !== 'x') return
    const base = openRef.current ? -DELETE_W : 0
    setTx(Math.max(-DELETE_W - 24, Math.min(0, base + dx)))
  }
  const onUp = () => {
    if (!activeRef.current) return
    activeRef.current = false
    setDragging(false)
    if (axis.current === 'x') {
      const open = tx < -DELETE_W / 2
      openRef.current = open
      setTx(open ? -DELETE_W : 0)
    }
    axis.current = null
  }

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        aria-label="Delete shift"
        tabIndex={tx < -10 ? 0 : -1}
        onClick={() => {
          close()
          onDelete()
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-[15px] font-semibold text-white active:bg-red-600"
        style={{ width: DELETE_W }}
      >
        Delete
      </button>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={(e) => {
          // A desktop drag also fires a click — swallow it but KEEP the row
          // open (so the revealed Delete stays tappable). A plain tap on an
          // open row closes it. A normal tap falls through to open the editor.
          if (movedRef.current) {
            movedRef.current = false
            e.stopPropagation()
            e.preventDefault()
            return
          }
          if (openRef.current) {
            e.stopPropagation()
            e.preventDefault()
            close()
          }
        }}
        className="relative bg-card"
        style={{
          transform: `translateX(${tx}px)`,
          touchAction: 'pan-y',
          transition: dragging ? 'none' : 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
