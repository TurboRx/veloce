import Head from "next/head";
import Link from "next/link";
import { Zap, Bot, ArrowRight, ShieldCheck, Cpu, Layers, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface HealthData {
  status: string;
  version: string;
  timestamp: string;
}

interface UserData {
  id: string;
  email: string;
  display_name: string;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string;
}

export default function Home() {
  const { data: health, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ["service-health"],
    queryFn: async () => {
      try {
        const res = await fetch("http://localhost:8080/v1/health");
        if (!res.ok) throw new Error("Offline");
        return res.json();
      } catch {
        return { status: "local-dev", version: "0.1.0", timestamp: new Date().toISOString() };
      }
    },
    refetchInterval: 15000,
  });

  const { data: user, refetch: refetchUser } = useQuery<UserData | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      try {
        const res = await fetch("http://localhost:8080/v1/user/@me", {
          credentials: "include",
        });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:8080/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      await refetchUser();
    } catch {
      // Ignored
    }
  };

  return (
    <>
      <Head>
        <title>Veloce - High-Velocity No-Code Discord Bot Builder</title>
        <meta name="description" content="Build powerful Discord bots visually with zero code." />
      </Head>

      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
        {/* Navigation */}
        <header className="border-b border-slate-800/80 px-6 py-4 flex items-center justify-between backdrop-blur bg-slate-950/70 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 rounded-lg border border-indigo-500/30 text-indigo-400">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              VELOCE
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
              <span className={`w-2 h-2 rounded-full ${healthLoading ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
              <span className="text-slate-400">Backend:</span>
              <span className="text-slate-200">{health?.status || "Connecting..."}</span>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  {user.discord_avatar ? (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=32`}
                      alt={user.display_name}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="font-medium text-slate-200">{user.display_name}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <a
                href="http://localhost:8080/v1/auth/login"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white transition shadow"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign in with Discord
              </a>
            )}

            {user && (
              <Link
                href="/apps"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition"
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400" /> My Bots
              </Link>
            )}

            <Link
              href="/builder"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
            >
              Open Builder <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-6 py-16 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-6">
            <Bot className="w-3.5 h-3.5" /> High-Throughput Discord Automation
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl leading-tight">
            The high-velocity, no-code{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Discord Bot Builder
            </span>
          </h1>

          <p className="mt-6 text-slate-400 text-lg max-w-2xl">
            Design interactive slash commands, automated server event listeners, and dynamic response flows on an intuitive visual canvas. Built on Go and React Flow.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/builder"
              className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/20 transition flex items-center gap-2"
            >
              Launch Flow Canvas <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/TurboRx/veloce"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium text-sm transition"
            >
              View GitHub Repo
            </a>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-left w-full">
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="p-2.5 w-fit rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-100 mb-2">Compiled Go Engine</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Flow graphs are compiled into in-memory trees and run across lightweight goroutines with sub-millisecond dispatch.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="p-2.5 w-fit rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-100 mb-2">Visual Node Canvas</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Seamless drag-and-drop workflow editor built with React Flow, rich conditions, message templates, and undo/redo history.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="p-2.5 w-fit rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-100 mb-2">Encrypted Multi-Tenancy</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Customer bot tokens are AES-256 encrypted at rest, and sharded websocket connections handle thousands of bots efficiently.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 px-6 py-6 text-center text-xs text-slate-500">
          Veloce &copy; {new Date().getFullYear()} &bull; Licensed under AGPL-3.0
        </footer>
      </main>
    </>
  );
}
