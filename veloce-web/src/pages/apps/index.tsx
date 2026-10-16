import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { Zap, Bot, Plus, Trash2, ArrowRight, ExternalLink, ShieldCheck, Key, Copy, Check, Globe, Radio } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, App } from "@/lib/api";

export default function AppsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [customName, setCustomName] = useState("");
  const [publicKey, setPublicKey] = useState("");

  const { data: apps, isLoading } = useQuery<App[]>({
    queryKey: ["apps-list"],
    queryFn: () => api.listApps(),
    retry: false,
  });

  const getWebhookUrl = (appId: string) => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith("http")) {
        return `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/v1/interactions/${appId}`;
      }
      return `${origin}/v1/interactions/${appId}`;
    }
    return `/v1/interactions/${appId}`;
  };

  const copyWebhookUrl = (appId: string) => {
    const url = getWebhookUrl(appId);
    navigator.clipboard.writeText(url);
    setCopiedAppId(appId);
    toast.success("Interactions webhook URL copied to clipboard!");
    setTimeout(() => setCopiedAppId(null), 2500);
  };

  const createAppMutation = useMutation({
    mutationFn: async () => {
      return api.createApp({
        token: token.trim(),
        name: customName.trim() ? customName.trim() : undefined,
        public_key: publicKey.trim() ? publicKey.trim() : undefined,
      });
    },
    onSuccess: () => {
      toast.success("Bot connected successfully!");
      setToken("");
      setCustomName("");
      setPublicKey("");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["apps-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to connect bot");
    },
  });

  const updateAppMutation = useMutation({
    mutationFn: async ({ id, publicKey }: { id: string; publicKey: string }) => {
      return api.updateApp(id, { public_key: publicKey.trim() || undefined });
    },
    onSuccess: () => {
      toast.success("Public key updated successfully!");
      setKeyModalOpen(null);
      setKeyInput("");
      queryClient.invalidateQueries({ queryKey: ["apps-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update public key");
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.deleteApp(id);
    },
    onSuccess: () => {
      toast.success("Bot deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["apps-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  return (
    <>
      <Head>
        <title>My Bots - Veloce</title>
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Navigation */}
        <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-950/80 backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="p-2 bg-indigo-600/20 rounded-lg border border-indigo-500/30 text-indigo-400">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                VELOCE
              </span>
            </Link>
            <div className="h-4 w-px bg-slate-800 mx-2" />
            <span className="text-sm font-medium text-slate-400">Applications</span>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
          >
            <Plus className="w-4 h-4" /> Connect Bot
          </button>
        </header>

        {/* Content */}
        <main className="max-w-6xl w-full mx-auto px-6 py-10 flex-1">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Discord Applications</h1>
              <p className="text-sm text-slate-400 mt-1">Manage connected Discord bots and configure command flows.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
              ))}
            </div>
          ) : !apps || apps.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center flex flex-col items-center">
              <div className="p-4 rounded-full bg-indigo-600/10 text-indigo-400 mb-4">
                <Bot className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-200">No Discord Bots Connected</h3>
              <p className="text-sm text-slate-400 max-w-sm mt-1 mb-6">
                Connect your first bot by providing its token from the Discord Developer Portal.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
              >
                <Plus className="w-4 h-4" /> Connect Discord Bot
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {app.discord_avatar ? (
                          <img
                            src={`https://cdn.discordapp.com/avatars/${app.discord_id}/${app.discord_avatar}.png?size=64`}
                            alt={app.name}
                            className="w-10 h-10 rounded-full border border-slate-700"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                            <Bot className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-semibold text-sm text-slate-100">{app.name}</h4>
                          <span className="text-[11px] font-mono text-slate-500">{app.discord_id}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => deleteAppMutation.mutate(app.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                        title="Delete application"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {app.description && (
                      <p className="text-xs text-slate-400 mt-3 line-clamp-2">{app.description}</p>
                    )}

                    {/* Mode Status Pill */}
                    <div className="mt-4 flex items-center justify-between text-xs">
                      {app.discord_public_key ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Zap className="w-3 h-3 text-emerald-400" /> Serverless ($0 Idle)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Radio className="w-3 h-3 text-amber-400" /> Gateway Mode
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setKeyModalOpen(app.id);
                          setKeyInput(app.discord_public_key || "");
                        }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition"
                      >
                        {app.discord_public_key ? "Edit Public Key" : "+ Set Public Key"}
                      </button>
                    </div>

                    {/* Interactions Webhook URL Box */}
                    <div className="mt-3 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span className="flex items-center gap-1 font-medium">
                          <Globe className="w-3 h-3 text-indigo-400" /> Interactions Endpoint URL
                        </span>
                        <button
                          type="button"
                          onClick={() => copyWebhookUrl(app.id)}
                          className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition"
                        >
                          {copiedAppId === app.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-[11px] text-slate-300 truncate select-all bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                        {getWebhookUrl(app.id)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Active
                    </span>

                    <Link
                      href={`/builder?app=${app.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
                    >
                      Flow Builder <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Connect Bot Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative">
              <div className="flex items-center gap-2 text-indigo-400 mb-2">
                <Key className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-100">Connect Discord Bot</h3>
              </div>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Enter your bot token from the{" "}
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Discord Developer Portal <ExternalLink className="w-3 h-3" />
                </a>
                . Tokens are encrypted at rest with AES-256-GCM.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Bot Token <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="MTAy..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Custom App Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank to use Discord bot username"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center justify-between">
                    <span>
                      Discord Public Key <span className="text-slate-500 font-normal">(Optional for Serverless)</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      $0 / Zero RAM
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 52c92e97b..."
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                    From Discord Portal &gt; General Information. Enables handling slash commands via HTTP webhooks with 0 idle CPU/RAM.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!token.trim() || createAppMutation.isPending}
                  onClick={() => createAppMutation.mutate()}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow transition flex items-center gap-1.5"
                >
                  {createAppMutation.isPending ? "Verifying..." : "Verify & Connect"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Configure Public Key Modal */}
        {keyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative">
              <div className="flex items-center gap-2 text-indigo-400 mb-2">
                <Zap className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-100">Configure Discord Public Key</h3>
              </div>
              <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                Paste your bot&apos;s <strong>PUBLIC KEY</strong> from the{" "}
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Discord Developer Portal <ExternalLink className="w-3 h-3" />
                </a>{" "}
                under General Information. This enables verified Ed25519 serverless webhooks.
              </p>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Public Key (64-character hex)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 52c92e97b..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setKeyModalOpen(null);
                    setKeyInput("");
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateAppMutation.isPending}
                  onClick={() => {
                    if (keyModalOpen) {
                      updateAppMutation.mutate({ id: keyModalOpen, publicKey: keyInput });
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow transition flex items-center gap-1.5"
                >
                  {updateAppMutation.isPending ? "Saving..." : "Save Public Key"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
