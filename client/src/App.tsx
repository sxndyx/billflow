import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useOnboarding } from "@/hooks/use-onboarding";
import { Loader2 } from "lucide-react";
import SetupWizard from "@/pages/SetupWizard";

import Dashboard from "@/pages/Dashboard";
import Timesheet from "@/pages/Timesheet";
import Clients from "@/pages/Clients";
import Invoices from "@/pages/Invoices";
import Goals from "@/pages/Goals";
import Settings from "@/pages/Settings";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/not-found";
import { Sidebar, MobileNav } from "@/components/Navigation";

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Component />
      </main>
      <MobileNav />
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  // Only meaningful once signed in; the query is cheap and cached.
  const { needsSetup, isLoading: onboardingLoading } = useOnboarding();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={AuthPage} />
        <Route component={AuthPage} />
      </Switch>
    );
  }

  if (onboardingLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // A fresh install has no business details or rates, so there is nothing
  // useful to show on the dashboard until setup is done.
  if (needsSetup) return <SetupWizard />;

  return (
    <Switch>
      <Route path="/" component={() => <PrivateRoute component={Dashboard} />} />
      <Route path="/timesheet" component={() => <PrivateRoute component={Timesheet} />} />
      <Route path="/clients" component={() => <PrivateRoute component={Clients} />} />
      <Route path="/invoices" component={() => <PrivateRoute component={Invoices} />} />
      <Route path="/goals" component={() => <PrivateRoute component={Goals} />} />
      <Route path="/settings" component={() => <PrivateRoute component={Settings} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
