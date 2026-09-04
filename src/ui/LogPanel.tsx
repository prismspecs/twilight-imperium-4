import { useEffect, useRef, useState } from 'react'
import { clearDebugLog, getDebugLogEntries, subscribeDebugLog } from './debugLogger'
import type { DebugLogEntry } from './debugLogger'
import { describeEntry } from './logText'
import { useEscape } from './useEscape'
import type { GameState } from '../engine/types'

export function LogPanel({ state, onClose }: { state: GameState; onClose?: () => void }) {
  useEscape(onClose)
  const [tab, setTab] = useState<'game' | 'debug'>('game')
  const [filter, setFilter] = useState<'ALL' | 'WARN_ERROR' | 'ERROR'>('ALL')
  const [, setTick] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return subscribeDebugLog(() => {
      setTick(t => t + 1)
    })
  }, [])

  // the newest (bottom) entries are the ones that matter, so every new entry jumps the scroll to the foot
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.log, tab])

  const debugEntries = getDebugLogEntries().filter(e => {
    if (filter === 'ERROR') return e.level === 'ERROR'
    if (filter === 'WARN_ERROR') return e.level === 'WARN' || e.level === 'ERROR'
    return true
  })

  return (
    <div className="logpanel" data-testid="log-panel" style={{ width: tab === 'debug' ? '640px' : undefined }}>
      <div className="in">
        <div className="dhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn ${tab === 'game' ? 'gold' : 'quiet'}`}
              data-testid="tab-game-log"
              onClick={() => setTab('game')}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Game log
            </button>
            <button
              type="button"
              className={`btn ${tab === 'debug' ? 'gold' : 'quiet'}`}
              data-testid="tab-debug-log"
              onClick={() => setTab('debug')}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Debug log ({getDebugLogEntries().length})
            </button>
          </div>
          <div className="right" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {tab === 'debug' && (
              <>
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value as typeof filter)}
                  style={{ background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: '3px', fontSize: '11px', padding: '2px 4px' }}
                  data-testid="debug-filter-select"
                >
                  <option value="ALL">All Levels</option>
                  <option value="WARN_ERROR">Warn & Error</option>
                  <option value="ERROR">Error Only</option>
                </select>
                <button
                  type="button"
                  className="btn quiet"
                  data-testid="btn-clear-debug-log"
                  onClick={clearDebugLog}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                >
                  Clear
                </button>
              </>
            )}
            {onClose ? <button type="button" className="btn quiet" data-testid="btn-log-close" onClick={onClose}>Close</button> : null}
          </div>
        </div>

        {tab === 'game' ? (
          <div className="loglist" data-testid="log-list" ref={listRef}>
            {state.log.map((entry, i) => {
              const line = describeEntry(state, entry)
              return <div className={`logline ${line.kind}`} key={i} data-testid={`log-entry-${i}`}>{line.text}</div>
            })}
          </div>
        ) : (
          <div
            className="loglist debuglist"
            data-testid="debug-log-list"
            ref={listRef}
            style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4' }}
          >
            {debugEntries.length === 0 ? (
              <div style={{ padding: '12px', color: '#666', textAlign: 'center' }}>No debug entries recorded yet</div>
            ) : (
              debugEntries.map((entry: DebugLogEntry) => {
                const color = entry.level === 'ERROR' ? '#ff6b6b' : entry.level === 'WARN' ? '#ffa94d' : '#4dabf7'
                return (
                  <div
                    key={entry.id}
                    data-testid={`debug-entry-${entry.id}`}
                    style={{
                      padding: '4px 6px',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                      <span style={{ color: '#777', fontSize: '10px' }}>{entry.time.slice(11, 19)}</span>
                      <span style={{ color, fontWeight: 'bold', fontSize: '10px', minWidth: '42px' }}>[{entry.level}]</span>
                      <span style={{ color: '#adb5bd', fontWeight: 600 }}>[{entry.category}]</span>
                      <span style={{ color: '#eee', flex: 1, wordBreak: 'break-word' }}>{entry.message}</span>
                    </div>
                    {entry.data !== undefined && (
                      <pre
                        style={{
                          margin: '2px 0 0 48px',
                          padding: '4px 6px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: '2px',
                          color: '#aaa',
                          fontSize: '10px',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '120px',
                          overflowY: 'auto',
                        }}
                      >
                        {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
