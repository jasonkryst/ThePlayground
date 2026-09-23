import { Component } from 'react'
import './ErrorBoundary.css'

// Class component — React error boundaries must be class-based because the
// lifecycle methods (getDerivedStateFromError / componentDidCatch) have no
// hook equivalents yet. This catches any render-time, lifecycle, or
// constructor error thrown in a descendant tree and renders a safe fallback
// rather than leaving the screen blank.
//
// Placement in main.jsx wraps the entire app so no uncaught game error can
// escape to the browser. Games added via auto-discovery run with no manual
// review gate, so this is the last defence against a broken game taking out
// the whole UI (issue #207).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Surface to DevTools / future error-monitoring without rethrowing.
    console.error('[ErrorBoundary] Uncaught render error:', error, info?.componentStack)
  }

  handleReset() {
    this.setState({ hasError: false, error: null })
    // Navigate to the root so the broken game route is no longer active.
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary__card">
            <h1 className="error-boundary__heading">Something went wrong</h1>
            <p className="error-boundary__body">
              An unexpected error occurred. Your saved progress is safe.
            </p>
            <button
              type="button"
              className="error-boundary__btn"
              onClick={this.handleReset}
            >
              Go home
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
