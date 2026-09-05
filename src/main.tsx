import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { CONVEX_URL } from "@/lib/convexUrl";
// Leaflet styles belong to the app shell (static <link> in the built
// index.html), NOT to a lazy route chunk. Imported from a route component
// they ship as a runtime-injected async stylesheet, which can fail to apply
// in production deployments and leaves the map panes/tiles unstyled =
// invisible map even though tiles download fine.
import "leaflet/dist/leaflet.css";
import { OnboardingProvider } from "./lib/onboarding-context";
import { VoiceAssistant } from "./components/VoiceAssistant";
import AppShell from "./components/AppShell";

// Lazy load route components
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Analysis = lazy(() => import("./pages/Analysis.tsx"));
const Finance = lazy(() => import("./pages/Finance.tsx"));
const Market = lazy(() => import("./pages/Market.tsx"));
const Schemes = lazy(() => import("./pages/Schemes.tsx"));
const Reports = lazy(() => import("./pages/Reports.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Advisor = lazy(() => import("./pages/Advisor.tsx"));
const WhatIf = lazy(() => import("./pages/WhatIf.tsx"));
const Compare = lazy(() => import("./pages/Compare.tsx"));
const Report = lazy(() => import("./pages/Report.tsx"));
const Application = lazy(() => import("./pages/Application.tsx"));
const Plan = lazy(() => import("./pages/Plan.tsx"));

// Loading fallback
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <span className="text-sm font-bold text-primary font-serif-display">GramUdaan</span>
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
        <span className="text-sm text-muted-foreground font-medium">Loading...</span>
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
  </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(CONVEX_URL);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <OnboardingProvider>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              {/* ── Public ── */}
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/onboarding" />}
              />
              {/* Onboarding stays a separate, focused flow (not inside the app shell) */}
              <Route path="/onboarding" element={<Onboarding />} />

              {/* ── GramUdaan app (authenticated shell: header, sidebar, bottom nav) ── */}
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/advisor" element={<Advisor />} />
                <Route path="/analysis" element={<Analysis />} />
                <Route path="/finance" element={<Finance />} />
                <Route path="/market" element={<Market />} />
                <Route path="/schemes" element={<Schemes />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Profile />} />
                <Route path="/plan" element={<Plan />} />
                <Route path="/what-if" element={<WhatIf />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/report" element={<Report />} />
                <Route path="/application" element={<Application />} />
              </Route>

              <Route path="/saved" element={<Navigate to="/reports" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </OnboardingProvider>
          <VoiceAssistant />
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
