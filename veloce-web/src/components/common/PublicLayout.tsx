import Head from "next/head";
import Link from "next/link";
import { ReactNode } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { ThemeSwitch, DiscordLogo, GitHubLogo } from "@/components/common/ThemeSwitch";
import { getLoginUrl } from "@/lib/api";
import { useCurrentUser } from "@/lib/useAuth";

interface PublicLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

export default function PublicLayout({
  title,
  description,
  children,
}: PublicLayoutProps) {
  const { data: user } = useCurrentUser();
  const isAuthenticated = Boolean(user);
  const loginHref = getLoginUrl("/apps");

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>

      <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary/20 selection:text-primary overflow-x-hidden">
        {/* Sticky Navigation Bar */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-8">
              <Link
                href="/"
                className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight"
              >
                <div className="p-1.5 bg-primary/15 rounded-xl border border-primary/30 text-primary shadow-sm">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <span>VELOCE</span>
              </Link>

              <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
                <Link href="/docs" className="hover:text-foreground transition">
                  Documentation
                </Link>
                <Link
                  href="/guides/how-to-make-a-discord-bot"
                  className="hover:text-foreground transition"
                >
                  Bot Building Guide
                </Link>
                <Link href="/tools" className="hover:text-foreground transition">
                  Discord Tools
                </Link>
                <Link href="/#pricing" className="hover:text-foreground transition">
                  Pricing
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3">
              <ThemeSwitch />

              <a
                href="https://github.com/TurboRx/veloce"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary/80 hover:bg-secondary border border-border text-xs sm:text-sm font-medium text-foreground transition"
              >
                <GitHubLogo className="w-4 h-4" />
                <span>GitHub</span>
              </a>

              {isAuthenticated ? (
                <Link
                  href="/apps"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:opacity-95 text-primary-foreground text-xs sm:text-sm font-semibold shadow-md shadow-primary/20 transition"
                >
                  <span>Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <a
                  href={loginHref}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs sm:text-sm font-semibold shadow-md shadow-[#5865F2]/25 transition"
                >
                  <DiscordLogo className="w-4 h-4" />
                  <span>Login with Discord</span>
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>

        {/* Multi-Column Footer */}
        <footer className="border-t border-border bg-card/40 py-12 px-4 sm:px-6 text-xs text-muted-foreground">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 mb-8">
            <div className="sm:col-span-2">
              <Link
                href="/"
                className="flex items-center gap-2 text-foreground font-bold text-base mb-3"
              >
                <div className="p-1.5 bg-primary/15 rounded-lg border border-primary/30 text-primary">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <span>VELOCE</span>
              </Link>
              <p className="text-muted-foreground max-w-sm leading-relaxed">
                The visual no-code Discord bot builder and 24/7 cloud hosting platform for modern
                communities.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 uppercase tracking-wider text-[11px]">
                Platform
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/#use-cases" className="hover:text-foreground transition">
                    Use Cases
                  </Link>
                </li>
                <li>
                  <Link href="/#how-it-works" className="hover:text-foreground transition">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/#features" className="hover:text-foreground transition">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/#pricing" className="hover:text-foreground transition">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 uppercase tracking-wider text-[11px]">
                Resources
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/docs" className="hover:text-foreground transition">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides/how-to-make-a-discord-bot"
                    className="hover:text-foreground transition"
                  >
                    Bot Building Guide
                  </Link>
                </li>
                <li>
                  <Link href="/tools" className="hover:text-foreground transition">
                    Discord Tools
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 uppercase tracking-wider text-[11px]">
                Legal
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/terms" className="hover:text-foreground transition">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground transition">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/refund" className="hover:text-foreground transition">
                    Refund Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="max-w-7xl mx-auto pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} Veloce. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/TurboRx/veloce"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition"
              >
                <GitHubLogo className="w-4 h-4" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
