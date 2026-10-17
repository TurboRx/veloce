import React from "react";
import Link from "next/link";
import { Zap, LogIn, ArrowLeft } from "lucide-react";
import { getLoginUrl } from "@/lib/api";

interface AuthBarrierProps {
  redirectTo?: string;
  title?: string;
  description?: string;
}

export function AuthBarrier({
  redirectTo = "/apps",
  title = "Sign In Required",
  description = "Please sign in with Discord to access your bot applications and the Flow Builder.",
}: AuthBarrierProps) {
  const loginHref = typeof window !== "undefined" ? getLoginUrl(redirectTo) : getLoginUrl(redirectTo);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center shadow-2xl flex flex-col items-center">
        <div className="p-3 bg-indigo-600/10 rounded-xl border border-indigo-500/20 text-indigo-400 mb-4">
          <Zap className="w-6 h-6 fill-current" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-slate-100 mb-2">{title}</h2>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">{description}</p>

        <a
          href={loginHref}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white transition shadow-lg shadow-[#5865F2]/20"
        >
          <LogIn className="w-4 h-4" /> Sign In
        </a>

        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
        </Link>
      </div>
    </div>
  );
}
