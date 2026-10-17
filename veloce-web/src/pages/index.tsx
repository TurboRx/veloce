import Head from "next/head";
import Link from "next/link";
import { Zap, Bot, ArrowRight, ShieldCheck, Layers, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { useCurrentUser } from "@/lib/useAuth";
import { api, getLoginUrl } from "@/lib/api";

export default function Home() {
  const { data: user, refetch: refetchUser } = useCurrentUser();

  const handleLogout = async () => {
    try {
      await api.logout();
      await refetchUser();
    } catch {
      // Ignored
    }
  };

  const loginHref = getLoginUrl("/apps");

  return (
    <>
      <Head>
        <title>Veloce - Visual Discord Bot Builder</title>
        <meta
          name="description"
          content="Build powerful, interactive Discord bots visually without code."
        />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30 overflow-x-hidden">
        {/* Navigation */}
        <header className="border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between backdrop-blur-md bg-slate-950/80 sticky top-0 z-50">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/10 rounded-xl border border-indigo-500/20 text-indigo-400">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <span className="font-bold text-base tracking-tight text-slate-100">
              VELOCE
            </span>
          </Link>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  {user.discord_avatar ? (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=32`}
                      alt={user.display_name}
                      className="w-4 h-4 rounded-full"
                    />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="font-medium text-slate-200 hidden sm:inline">{user.display_name}</span>
                </div>

                <Link
                  href="/apps"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
                >
                  Flow Builder <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <a
                href={loginHref}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white transition shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </a>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-6">
            <Bot className="w-3.5 h-3.5" /> Visual Discord Bot Builder
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-100 max-w-2xl leading-[1.15]">
            Build custom Discord bots{" "}
            <span className="text-indigo-400">without writing code</span>
          </h1>

          <p className="mt-5 text-slate-400 text-sm sm:text-base max-w-xl leading-relaxed">
            Create interactive slash commands, automate server triggers, and design smart flows on an intuitive visual canvas. Fast, secure, and ready for your community.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {user ? (
              <Link
                href="/apps"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                Flow Builder <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <a
                href={loginHref}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" /> Sign In
              </a>
            )}

            <a
              href="https://github.com/TurboRx/veloce"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-sm transition text-center shadow-sm"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
                className="w-4 h-4 flex-shrink-0"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </a>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mt-16 text-left w-full">
            <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
              <div className="p-2.5 w-fit rounded-xl bg-indigo-500/10 text-indigo-400 mb-3.5">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-100 mb-1.5">Instant Responses</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Commands and button interactions trigger with sub-millisecond dispatch so your community gets fluid, instant replies.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
              <div className="p-2.5 w-fit rounded-xl bg-indigo-500/10 text-indigo-400 mb-3.5">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-100 mb-1.5">Visual Flow Canvas</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect triggers, conditions, and actions visually on a clean drag-and-drop workspace.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
              <div className="p-2.5 w-fit rounded-xl bg-indigo-500/10 text-indigo-400 mb-3.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-100 mb-1.5">Always Online</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Built for 24/7 reliability. Your bots stay active around the clock without manual server maintenance.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 px-4 sm:px-8 py-5 text-center text-xs text-slate-500">
          Veloce &copy; {new Date().getFullYear()} &bull; Visual Discord Bot Builder
        </footer>
      </div>
    </>
  );
}
