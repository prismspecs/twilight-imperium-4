import { useEffect, useRef } from 'react'
import { describeEntry } from './logText'
import { useEscape } from './useEscape'
import type { GameState } from '../engine/types'

export function LogPanel({ state, onClose }: { state: GameState; onClose?: () => void }) {
  useEscape(onClose)
  const listRef = useRef<HTMLDivElement | null>(null)
  // the newest (bottom) entries are the ones that matter, so every new entry jumps the scroll to the foot;
  // otherwise a long battle's yellow roll lines pile up off-screen below the fold and can't be reached
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.log])
  return (
    <div className="logpanel cut" data-testid="log-panel">
      <div className="in">
        <div className="dhead">
          <span className="tab">Game log</span>
          {onClose ? <div className="right"><button type="button" className="btn quiet" data-testid="btn-log-close" onClick={onClose}>Close</button></div> : null}
        </div>
        <div className="loglist" data-testid="log-list" ref={listRef}>
          {state.log.map((entry, i) => {
            const line = describeEntry(state, entry)
            return <div className={`logline ${line.kind}`} key={i} data-testid={`log-entry-${i}`}>{line.text}</div>
          })}
        </div>
      </div>
    </div>
  )
}
