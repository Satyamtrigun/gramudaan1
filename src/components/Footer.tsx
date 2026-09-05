import { Globe } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <Globe className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold font-sans-body">GramUdaan</span>
            </div>
            <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-xs">
              An AI-powered business advisory platform helping rural and semi-urban
              entrepreneurs make smarter, data-driven decisions before they invest.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-primary-foreground/50">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {["How It Works", "Features", "Trust & Safety", "Contact"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-primary-foreground/50">
              Legal
            </h4>
            <ul className="space-y-2.5">
              {["Privacy Policy", "Terms of Service", "Disclaimer"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-primary-foreground/50">
              Get in Touch
            </h4>
            <ul className="space-y-2.5">
              <li className="text-sm text-primary-foreground/70">
                hello@ruralbiz.ai
              </li>
              <li className="text-sm text-primary-foreground/70">
                Demo Helpline: 1800-XXX-XXXX
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-primary-foreground/50">
            © 2026 GramUdaan. All rights reserved.
          </p>
          <p className="text-xs text-primary-foreground/40 text-center sm:text-right max-w-md">
            Recommendations are based on available data, estimates and defined rules. Verify critical financial and regulatory information before making investment decisions.
          </p>
        </div>
      </div>
    </footer>
  );
}
