import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppBootFailureState } from "#src/components/AppBootFailureState.tsx";

type AppBootErrorBoundaryProps = {
  children: ReactNode;
};

type AppBootErrorBoundaryState = {
  error: unknown;
};

export class AppBootErrorBoundary extends Component<
  AppBootErrorBoundaryProps,
  AppBootErrorBoundaryState
> {
  state: AppBootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): AppBootErrorBoundaryState {
    return {
      error,
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("App boot failure", error, errorInfo);
  }

  render() {
    if (this.state.error !== null) {
      return <AppBootFailureState error={this.state.error} />;
    }

    return this.props.children;
  }
}
