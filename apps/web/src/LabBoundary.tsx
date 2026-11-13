import { Component } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Panel } from './components'

/** A failed lazy route leaves the shell/guide available; reload preserves its URL and saved data. */
export default class LabBoundary extends Component<{ children: ReactNode; label: string; onCancel?: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <Panel className="lab-load-error" role="alert"><h1>{this.props.label} could not open.</h1><p>The lab could not load. Check your connection to the local web server, then reload. Saved documents, versions and tour progress are retained.</p><Button onClick={() => window.location.reload()}>Reload current lab</Button>{this.props.onCancel && <Button onClick={this.props.onCancel}>Cancel Guided Demo</Button>}<Link className="button" to="/">Return to Overview</Link></Panel>
    return this.props.children
  }
}
