import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { t } from "@/i18n/fr"

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[COPYA]", error, errorInfo.componentStack)
    this.setState({ errorInfo })
  }

  private reset = () => {
    this.setState({ error: null, errorInfo: null })
  }

  render() {
    const { error, errorInfo } = this.state
    if (!error) return this.props.children

    const stack = error.stack ?? error.message

    return (
      <div
        role="alert"
        className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 py-10 text-foreground"
      >
        <div className="w-full max-w-lg space-y-3 rounded-lg border border-destructive/40 bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-destructive">{t.errorBoundary.title}</h1>
          <p className="text-sm text-muted-foreground">{t.errorBoundary.description}</p>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {error.message}
          </pre>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground">
              {t.errorBoundary.details}
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 font-mono whitespace-pre-wrap break-all">
              {stack}
              {errorInfo?.componentStack ? `\n\n--- React ---${errorInfo.componentStack}` : null}
            </pre>
          </details>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="default" onClick={() => window.location.reload()}>
              {t.errorBoundary.reload}
            </Button>
            <Button type="button" variant="outline" onClick={this.reset}>
              {t.errorBoundary.retry}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
