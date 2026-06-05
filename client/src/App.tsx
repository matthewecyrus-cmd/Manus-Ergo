import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SessionProvider } from "./contexts/SessionContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import TaskSetup from "./pages/TaskSetup";
import LiveScan from "./pages/LiveScan";
import Sessions from "./pages/Sessions";
import SessionReport from "./pages/SessionReport";
import VideoUpload from "./pages/VideoUpload";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/setup" component={TaskSetup} />
        <Route path="/scan" component={LiveScan} />
        <Route path="/sessions" component={Sessions} />
        <Route path="/sessions/:id" component={SessionReport} />
        <Route path="/upload" component={VideoUpload} />
        <Route path="/settings" component={Settings} />
        <Route path="/reports" component={Reports} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <SessionProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
