import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Route-level code splitting: this was previously one 1.13MB bundle
// (Vite flagged it as over the 500kB warning threshold) since every page
// was statically imported into App.tsx regardless of which route the user
// actually visits.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Predictions = lazy(() => import("./pages/Predictions"));
const Alerts = lazy(() => import("./pages/Alerts"));
const CostOptimization = lazy(() => import("./pages/CostOptimization"));
const Admin = lazy(() => import("./pages/Admin"));
const Demo = lazy(() => import("./pages/Demo"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/" element={<Layout><Dashboard /></Layout>} />
              <Route path="/inventory" element={<Layout><Inventory /></Layout>} />
              <Route path="/predictions" element={<Layout><Predictions /></Layout>} />
              <Route path="/demo" element={<Layout><Demo /></Layout>} />
              <Route path="/alerts" element={<Layout><Alerts /></Layout>} />
              <Route path="/cost-optimization" element={<Layout><CostOptimization /></Layout>} />
              <Route path="/admin" element={<Layout><Admin /></Layout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
