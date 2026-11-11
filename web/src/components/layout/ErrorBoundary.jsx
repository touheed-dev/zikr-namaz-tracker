import { Component } from 'react';

/**
 * Catches a render error in one screen so the rest of the app (bottom nav,
 * other tabs) keeps working, and offers a retry. Resets when the route changes.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card state" role="alert">
        <div className="strong">This screen hit a problem</div>
        <div className="small muted">Your saved data is safe. Try again, or go to another tab.</div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
