/* ============================================================
   ErgoKit — App Router
   Design: Clinical Dashboard — DM Sans headings + Inter body
   Routes: Dashboard / Assessments / New Assessment (RULA/REBA wizard) / Reports / Settings
   ============================================================ */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Assessments from "./pages/Assessments";
import AssessmentDetail from "./pages/AssessmentDetail";
import NewAssessment from "./pages/NewAssessment";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/assessments" component={Assessments} />
        <Route path="/assessments/new" component={NewAssessment} />
        <Route path="/assessments/:id" component={AssessmentDetail} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
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
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
