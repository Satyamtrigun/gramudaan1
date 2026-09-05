import { Link, useLocation } from "react-router";
import { useState } from "react";
import { Menu, X, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  className?: string;
  variant?: "landing" | "app";
}

export function Navbar({ className, variant = "landing" }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isLanding = variant === "landing" || location.pathname === "/";

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/50 backdrop-blur-md",
        isLanding ? "bg-white/80" : "bg-white/90",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Globe className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground font-sans-body tracking-tight">
            Gram<span className="text-primary">Udaan</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {isLanding ? (
            <>
              <a href="#how-it-works" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                How It Works
              </a>
              <a href="#features" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#trust" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Trust
              </a>
            </>
          ) : (
            <>
              <Link to="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Link to="/advisor" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                AI Advisor
              </Link>
              <Link to="/what-if" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                What-If
              </Link>
              <Link to="/compare" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Compare
              </Link>
              <Link to="/report" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Report
              </Link>
            </>
          )}
          <Link
            to="/onboarding"
            className="ml-2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Analyze My Business
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
              →
            </span>
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-white px-4 pb-4">
          {isLanding ? (
            <div className="flex flex-col gap-1 py-2">
              <a href="#how-it-works" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                How It Works
              </a>
              <a href="#features" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                Features
              </a>
              <a href="#trust" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                Trust
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-1 py-2">
              <Link to="/dashboard" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                Dashboard
              </Link>
              <Link to="/advisor" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                AI Advisor
              </Link>
              <Link to="/what-if" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                What-If Simulator
              </Link>
              <Link to="/compare" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                Compare Businesses
              </Link>
              <Link to="/report" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                Business Report
              </Link>
            </div>
          )}
          <Link
            to="/onboarding"
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            onClick={() => setMobileOpen(false)}
          >
            Analyze My Business →
          </Link>
        </div>
      )}
    </nav>
  );
}
