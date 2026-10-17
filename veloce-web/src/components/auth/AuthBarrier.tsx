import React from "react";
import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import { getLoginUrl } from "@/lib/api";
import { DiscordLogo, ThemeSwitch } from "@/components/common/ThemeSwitch";

interface AuthBarrierProps {
  redirectTo?: string;
  title?: string;
  description?: string;
}

export function AuthBarrier({
  redirectTo = "/apps",
  title = "Sign In Required",
  description = "Sign in with your Discord account to access your bot applications and the visual Flow Builder.",
}: AuthBarrierProps) {
  const loginHref = getLoginUrl(redirectTo);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeSwitch />
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-8 text-center shadow-2xl flex flex-col items-center">
        <div className="p-3 bg-primary/15 rounded-xl border border-primary/25 text-primary mb-4">
          <Zap className="w-6 h-6 fill-current" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-foreground mb-2">{title}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed mb-6">{description}</p>

        <a
          href={loginHref}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white transition shadow-lg shadow-[#5865F2]/25"
        >
          <DiscordLogo className="w-4 h-4" />
          <span>Login with Discord</span>
        </a>

        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
        </Link>
      </div>
    </div>
  );
}
