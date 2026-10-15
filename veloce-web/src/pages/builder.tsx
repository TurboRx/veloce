import Head from "next/head";
import Link from "next/link";
import { ArrowLeft, Save, Play, Plus, Terminal, Send, GitFork, Sliders } from "lucide-react";
import { FlowCanvas } from "@/components/flow/FlowCanvas";
import { toast } from "sonner";

export default function BuilderPage() {
  const handleSave = () => {
    toast.success("Flow saved successfully!");
  };

  const handleDeploy = () => {
    toast.info("Queued slash command deployment to Discord.");
  };

  return (
    <>
      <Head>
        <title>Flow Builder - Veloce</title>
      </Head>

      <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-14 border-b border-slate-800 px-4 flex items-center justify-between bg-slate-900/90 z-20">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <div>
              <h1 className="text-sm font-semibold text-slate-200">/ping (Slash Command)</h1>
              <p className="text-[11px] text-slate-400">Flow ID: cmd_ping_main</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Save className="w-3.5 h-3.5" /> Save Flow
            </button>
            <button
              onClick={handleDeploy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Deploy Command
            </button>
          </div>
        </header>

        {/* Workspace Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Block Explorer */}
          <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-4 overflow-y-auto hidden md:flex">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 tracking-wider">
              <span>BLOCK PALETTE</span>
              <Plus className="w-4 h-4 cursor-pointer hover:text-white" />
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mt-2">Entry Triggers</div>
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-emerald-500/30 hover:border-emerald-500 text-xs flex items-center gap-2 cursor-grab transition">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-medium text-slate-200">Slash Command</div>
                  <div className="text-[10px] text-slate-400">Listens for /command</div>
                </div>
              </div>

              <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mt-4">Logic & Control</div>
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-indigo-500/30 hover:border-indigo-500 text-xs flex items-center gap-2 cursor-grab transition">
                <GitFork className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="font-medium text-slate-200">Condition Check</div>
                  <div className="text-[10px] text-slate-400">Branch True / False</div>
                </div>
              </div>

              <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider mt-4">Discord Actions</div>
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-500 text-xs flex items-center gap-2 cursor-grab transition">
                <Send className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="font-medium text-slate-200">Send Message</div>
                  <div className="text-[10px] text-slate-400">Send text or embed</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Flow Visual Canvas */}
          <main className="flex-1 p-3 bg-slate-950">
            <FlowCanvas />
          </main>

          {/* Right Inspector Panel */}
          <aside className="w-72 border-l border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-4 overflow-y-auto hidden lg:flex">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 tracking-wider">
              <Sliders className="w-4 h-4" />
              <span>BLOCK INSPECTOR</span>
            </div>

            <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-4 text-xs space-y-3">
              <div>
                <label className="text-slate-400 block mb-1">Selected Node</label>
                <div className="font-medium text-slate-200">Slash Command (/ping)</div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Command Description</label>
                <input
                  type="text"
                  readOnly
                  value="Replies with pong and server latency."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Ephemeral Response</label>
                <div className="flex items-center gap-2 text-emerald-400 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Enabled (Only caller sees response)
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
