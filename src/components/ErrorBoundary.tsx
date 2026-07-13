import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// React error boundaries must be class components -- there is no hooks
// equivalent (getDerivedStateFromError / componentDidCatch have no hook
// form as of React 18). Without this, any uncaught render error anywhere
// in the tree took down the entire app to a blank white screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error caught by ErrorBoundary:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full shadow-xl">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto p-3 bg-destructive/10 rounded-full w-fit">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. You can try returning to the dashboard;
                if this keeps happening, please contact support.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={this.handleReset} className="w-full gap-2">
                <RotateCcw className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
