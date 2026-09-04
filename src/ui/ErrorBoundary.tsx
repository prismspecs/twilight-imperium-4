import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { deleteGame, latestGameCode } from './persist'
import { codeFromRoute } from './route'
import { SpaceBackdrop } from './SpaceBackdrop'

interface ErrorBoundaryState { error: Error | null }

/** Drops the game that was open (the URL names it), never the other games this browser holds. */
function clearOpenGame(): void {
  const code = codeFromRoute(window.location.hash) ?? latestGameCode()
  if (code !== null) deleteGame(code)
  window.location.hash = '#/'
}

/**
 * A crash in a screen must not leave the two players staring at a blank page. The boundary shows what
 * broke and offers the one repair that always works: drop the game that was open and reload, because a
 * saved game from an older build is the likeliest way to get stuck in a crash loop.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('the hot-seat client crashed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <div className="crash" data-testid="error-boundary">
        <SpaceBackdrop />
        <div className="crashbox">
          <div className="in">
            <h1 className="title goldtext">Something broke</h1>
            <p className="crashmsg" data-testid="error-message">{error.message}</p>
            <button
              type="button" className="btn gold" data-testid="btn-clear-session"
              onClick={() => { clearOpenGame(); window.location.reload() }}
            >
              Clear the saved game and restart
            </button>
          </div>
        </div>
      </div>
    )
  }
}
