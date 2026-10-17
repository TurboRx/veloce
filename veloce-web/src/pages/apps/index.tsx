import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import {
  Zap,
  Bot,
  Plus,
  Trash2,
  ArrowRight,
  ExternalLink,
  Key,
  Copy,
  Check,
  Globe,
  LogOut,
  User as UserIcon,
  Settings2,
  Crown,
  Sparkles,
  UserPlus,
  Lock,
  CheckCircle2,
  X,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, getApiUrl, getAppInviteUrl, App, AppDiscordStatus } from "@/lib/api";
import { useCurrentUser } from "@/lib/useAuth";
import { AuthBarrier } from "@/components/auth/AuthBarrier";
import { ThemeSwitch, DiscordLogo } from "@/components/common/ThemeSwitch";

export default function AppsPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: authLoading, refetch: refetchUser } = useCurrentUser();

  const [modalOpen, setModalOpen] = useState(false);
  const [settingsApp, setSettingsApp] = useState<App | null>(null);
  const [settingsTab, setSettingsTab] = useState<"general" | "branding" | "credentials">("general");
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  // Settings form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [editPublicKey, setEditPublicKey] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editPlan, setEditPlan] = useState<"free" | "pro" | "studio">("free");
  const [editCustomBranding, setEditCustomBranding] = useState(false);
  const [editPresenceStatus, setEditPresenceStatus] = useState<"online" | "idle" | "dnd" | "invisible">("online");
  const [editActivityType, setEditActivityType] = useState<number>(0);
  const [editActivityName, setEditActivityName] = useState("");

  // Connect Bot form state
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [customName, setCustomName] = useState("");
  const [publicKey, setPublicKey] = useState("");

  // Dodo Payments Test Mode & Checkout State
  const [dodoSelectedCard, setDodoSelectedCard] = useState<string>("4242424242424242");
  const [dodoShowConfig, setDodoShowConfig] = useState(false);
  const [dodoApiKeyInput, setDodoApiKeyInput] = useState("");
  const [dodoWebhookKeyInput, setDodoWebhookKeyInput] = useState("");
  const [lastWebhookResult, setLastWebhookResult] = useState<any>(null);

  const { data: apps, isLoading: appsLoading } = useQuery<App[]>({
    queryKey: ["apps-list"],
    queryFn: () => api.listApps(),
    enabled: !!user,
    retry: false,
  });

  const { data: billingStatus, refetch: refetchBillingStatus } = useQuery({
    queryKey: ["dodo-billing-status"],
    queryFn: () => api.getBillingStatus(),
    enabled: !!user,
    retry: false,
  });

  const openSettingsModal = (app: App, initialTab: "general" | "branding" | "credentials" = "general") => {
    setSettingsApp(app);
    setSettingsTab(initialTab);
    setEditName(app.name || "");
    setEditDescription(app.description || "");
    setEditEnabled(app.enabled !== false);
    setEditPublicKey(app.discord_public_key || "");
    setEditToken("");
    setEditPlan(app.plan || "free");
    setEditCustomBranding(!!app.custom_branding);
    setEditPresenceStatus((app.discord_status?.status as any) || "online");
    setEditActivityType(app.discord_status?.activity_type ?? 0);
    setEditActivityName(app.discord_status?.activity_name || "");
    setLastWebhookResult(null);
  };

  const dodoCheckoutMutation = useMutation({
    mutationFn: async (plan: "pro" | "studio") => {
      if (!settingsApp) throw new Error("No bot selected");
      return api.createCheckoutSession({
        app_id: settingsApp.id,
        plan,
        customer_email: user?.email,
        customer_name: user?.display_name,
      });
    },
    onSuccess: (session) => {
      if (session.mode === "dodo_hosted" && session.checkout_url) {
        toast.success("Redirecting to Dodo Payments Hosted Checkout (Test Mode)...");
        window.location.href = session.checkout_url;
      } else {
        toast.info(
          "Dodo Test Mode Checkout Session created! Use a Dodo Test Card below to complete payment and verify the webhook."
        );
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to start Dodo checkout session");
    },
  });

  const dodoTestWebhookMutation = useMutation({
    mutationFn: async (payload: {
      plan: "pro" | "studio";
      scenario?: string;
      card_number?: string;
      upi_vpa?: string;
    }) => {
      if (!settingsApp) throw new Error("No bot selected");
      return api.triggerTestWebhook({
        app_id: settingsApp.id,
        ...payload,
      });
    },
    onSuccess: (res) => {
      setLastWebhookResult(res);
      if (res.app) {
        setSettingsApp(res.app);
        setEditPlan(res.app.plan || "free");
        setEditCustomBranding(Boolean(res.app.custom_branding));
      }
      queryClient.invalidateQueries({ queryKey: ["apps-list"] });
      refetchBillingStatus();
      if (res.event_type === "subscription.active") {
        toast.success(
          `Dodo Webhook verified (${res.webhook_id}): Bot upgraded to ${(res.app?.plan || "pro").toUpperCase()} & custom branding unlocked!`
        );
      } else if (res.event_type === "payment.failed") {
        toast.error(`Dodo Test Card Declined (${res.scenario}): ${res.event_type} webhook verified.`);
      } else {
        toast.info(`Dodo Webhook verified (${res.event_type}) for ${settingsApp?.name}`);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Dodo test webhook failed");
    },
  });

  const dodoConfigMutation = useMutation({
    mutationFn: async () => {
      return api.updateBillingConfig({
        api_key: dodoApiKeyInput.trim() || undefined,
        webhook_key: dodoWebhookKeyInput.trim() || undefined,
        environment: "test_mode",
      });
    },
    onSuccess: (res) => {
      refetchBillingStatus();
      setDodoApiKeyInput("");
      setDodoWebhookKeyInput("");
      setDodoShowConfig(false);
      if (res.provisioning_error) {
        toast.warning(`Saved config, but product auto-provisioning reported: ${res.provisioning_error}`);
      } else {
        toast.success("Dodo Payments Test Mode config saved & products verified!");
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update Dodo config");
    },
  });

  const getWebhookUrl = (appId: string) => {
    const path = getApiUrl(`/v1/interactions/${appId}`);
    if (path.startsWith("/") && typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return path;
  };

  const copyWebhookUrl = (appId: string) => {
    const url = getWebhookUrl(appId);
    navigator.clipboard.writeText(url);
    setCopiedAppId(appId);
    toast.success("Webhook URL copied to clipboard");
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
      toast.success("Bot connected and online!");
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
    mutationFn: async () => {
      if (!settingsApp) throw new Error("No app selected");
      const statusPayload: AppDiscordStatus = {
        status: editPresenceStatus,
        activity_type: editActivityType,
        activity_name: editActivityName.trim() || undefined,
      };
      return api.updateApp(settingsApp.id, {
        name: editName.trim() || settingsApp.name,
        description: editDescription.trim(),
        enabled: editEnabled,
        public_key: editPublicKey.trim(),
        token: editToken.trim() || undefined,
        plan: editPlan,
        custom_branding: (editPlan === "pro" || editPlan === "studio") ? editCustomBranding : false,
        discord_status: statusPayload,
      });
    },
    onSuccess: (updated) => {
      toast.success("Bot settings saved");
      setSettingsApp(updated);
      queryClient.invalidateQueries({ queryKey: ["apps-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save settings");
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.deleteApp(id);
    },
    onSuccess: () => {
      toast.success("Bot removed");
      queryClient.invalidateQueries({ queryKey: ["apps-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete bot");
    },
  });

  const handleLogout = async () => {
    try {
      await api.logout();
      await refetchUser();
    } catch {
      // Ignored
    }
  };

  if (!authLoading && !user) {
    return (
      <>
        <Head>
          <title>Sign In - Veloce</title>
        </Head>
        <AuthBarrier
          redirectTo="/apps"
          title="Sign In to Continue"
          description="Sign in with your Discord account to manage your bots and open the Flow Builder."
        />
      </>
    );
  }

  const primaryApp = apps && apps.length > 0 ? apps[0] : null;
  const isPaidPlan = settingsApp?.plan === "pro" || settingsApp?.plan === "studio";

  return (
    <>
      <Head>
        <title>Applications - Veloce</title>
      </Head>

      <div className="min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden selection:bg-primary/30">
        {/* Navigation */}
        <header className="border-b border-border/80 px-4 sm:px-6 py-3.5 flex items-center justify-between bg-background/80 backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="p-2 bg-primary/15 rounded-xl border border-primary/25 text-primary">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <span className="font-bold text-base tracking-tight text-foreground">
                VELOCE
              </span>
            </Link>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
              Applications
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeSwitch />

            {user && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card border border-border text-xs">
                {user.discord_avatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=32`}
                    alt={user.display_name}
                    className="w-4 h-4 rounded-full"
                  />
                ) : (
                  <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="font-medium text-foreground hidden md:inline">
                  {user.display_name}
                </span>
              </div>
            )}

            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:opacity-95 text-primary-foreground shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" /> Connect Bot
            </button>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-card transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Your Discord Bots
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Invite your bot to a server, configure custom branding &amp; status, or open the visual Flow Builder.
              </p>
            </div>
          </div>

          {/* Setup Checklist Banner (Inspired by reference benchmark) */}
          {primaryApp && !checklistDismissed && (
            <div className="mb-8 rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Get {primaryApp.name} Running in Discord
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Complete these 3 quick steps to test your bot live in your Discord server.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChecklistDismissed(true)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition"
                  title="Dismiss checklist"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl bg-background/60 border border-border p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-1">
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px]">
                        1
                      </span>
                      Add Bot to Your Server
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Authorize {primaryApp.name} in a Discord server where you can test commands.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={getAppInviteUrl(primaryApp.discord_id, "guild")}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold transition shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add to Server
                    </a>
                    <a
                      href={getAppInviteUrl(primaryApp.discord_id, "user")}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-xs font-medium transition"
                    >
                      Add to Account
                    </a>
                  </div>
                </div>

                <div className="rounded-xl bg-background/60 border border-border p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-1">
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px]">
                        2
                      </span>
                      Customize &amp; Deploy Flows
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A default <code className="font-mono text-primary">/ping</code> command is ready! Build more commands visually.
                    </p>
                  </div>
                  <div>
                    <Link
                      href={`/builder?app=${primaryApp.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:opacity-95 text-primary-foreground text-xs font-semibold transition shadow-sm"
                    >
                      Open Flow Builder <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                <div className="rounded-xl bg-background/60 border border-border p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-1">
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px]">
                        3
                      </span>
                      Try /ping in Discord
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Type <code className="font-mono text-primary">/ping</code> in your server channel to see your bot reply immediately.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://discord.com/channels/@me"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-xs font-semibold transition"
                    >
                      <DiscordLogo className="w-3.5 h-3.5" /> Open Discord
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {appsLoading || authLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-56 rounded-2xl bg-card/60 border border-border animate-pulse"
                />
              ))}
            </div>
          ) : !apps || apps.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 sm:p-12 text-center flex flex-col items-center">
              <div className="p-3.5 rounded-2xl bg-primary/10 text-primary mb-4">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                No Discord Bots Connected
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-6 leading-relaxed">
                Add your Discord bot token to start creating slash commands, event flows, and 24/7 automation.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary hover:opacity-95 text-primary-foreground shadow transition"
              >
                <Plus className="w-4 h-4" /> Connect Discord Bot
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {apps.map((app) => {
                const appPlan = app.plan || "free";
                const hasCustomBranding =
                  (appPlan === "pro" || appPlan === "studio") && !!app.custom_branding;

                return (
                  <div
                    key={app.id}
                    className="rounded-2xl bg-card border border-border p-5 flex flex-col justify-between hover:border-primary/40 transition shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {app.discord_avatar ? (
                            <img
                              src={`https://cdn.discordapp.com/avatars/${app.discord_id}/${app.discord_avatar}.png?size=64`}
                              alt={app.name}
                              className="w-11 h-11 rounded-full border border-border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                              <Bot className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-foreground truncate">
                                {app.name}
                              </h4>
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  appPlan === "studio"
                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                    : appPlan === "pro"
                                    ? "bg-primary/15 text-primary border border-primary/30"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                {appPlan}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground truncate block">
                              ID: {app.discord_id}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openSettingsModal(app, "general")}
                            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition"
                            title="Bot Settings & Branding"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteAppMutation.mutate(app.id)}
                            className="text-muted-foreground hover:text-rose-400 p-1.5 rounded-lg hover:bg-accent transition"
                            title="Remove bot"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Branding Status Pill */}
                      <div className="mt-4 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-background/70 border border-border text-xs">
                        {hasCustomBranding ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Custom Branding Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[11px]">
                            <Zap className="w-3.5 h-3.5 text-primary" /> Free Plan Branding Active
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => openSettingsModal(app, "branding")}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <Crown className="w-3 h-3" />
                          {hasCustomBranding ? "Manage" : "Remove Watermark"}
                        </button>
                      </div>

                      {/* Interactions Webhook URL Box */}
                      <div className="mt-3 bg-background/70 border border-border rounded-xl p-2.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                          <span className="flex items-center gap-1 font-medium">
                            <Globe className="w-3 h-3 text-primary" /> Interactions Endpoint URL
                          </span>
                          <button
                            type="button"
                            onClick={() => copyWebhookUrl(app.id)}
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline transition"
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
                        <div className="font-mono text-[11px] text-foreground truncate select-all bg-card px-2 py-1 rounded border border-border">
                          {getWebhookUrl(app.id)}
                        </div>
                      </div>

                      {/* Quick Action Buttons: Invite to Server + Settings */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <a
                          href={getAppInviteUrl(app.discord_id, "guild")}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-accent text-secondary-foreground text-xs font-semibold transition"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Invite Bot
                        </a>
                        <button
                          type="button"
                          onClick={() => openSettingsModal(app, "general")}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-accent text-secondary-foreground text-xs font-semibold transition"
                        >
                          <Settings2 className="w-3.5 h-3.5" /> Settings
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-border flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Online
                      </span>

                      <Link
                        href={`/builder?app=${app.id}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:opacity-95 text-primary-foreground text-xs font-semibold transition shadow-sm"
                      >
                        Flow Builder <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Connect Bot Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-2xl relative">
              <div className="flex items-center gap-2 text-primary mb-2">
                <Key className="w-5 h-5" />
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  Connect Discord Bot
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                Get your bot token from the{" "}
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  Discord Developer Portal <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Bot Token <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="MTAy..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Custom App Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Defaults to bot username"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Discord Public Key (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Found in General Information"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                  />
                </div>

                {createAppMutation.isError && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                    <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {(createAppMutation.error as any)?.code === "FAIR_USE_LIMIT_REACHED"
                          ? "Studio Fair Use Allocation Reached"
                          : "Bot Slot Allocation Reached"}
                      </span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      {(createAppMutation.error as any)?.message ||
                        "You have reached your current bot slot allocation."}
                    </p>
                    {apps && apps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          createAppMutation.reset();
                          openSettingsModal(apps[0], "branding");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-[11px] shadow-sm hover:opacity-95 transition"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>
                          {(createAppMutation.error as any)?.code === "FAIR_USE_LIMIT_REACHED"
                            ? "Add Extra Bot Slots"
                            : "Upgrade Plan"}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    createAppMutation.reset();
                    setModalOpen(false);
                  }}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!token.trim() || createAppMutation.isPending}
                  onClick={() => createAppMutation.mutate()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:opacity-95 disabled:opacity-50 text-primary-foreground shadow transition"
                >
                  {createAppMutation.isPending ? "Connecting..." : "Connect Bot"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Comprehensive Bot Settings, Presence & Branding Modal */}
        {settingsApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-[calc(100vw-1.5rem)] max-w-xl rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/15 text-primary">
                    <Settings2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-foreground">
                      {settingsApp.name} — Settings
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Configure appearance, custom branding, presence status, and credentials
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsApp(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-background border border-border my-4">
                <button
                  type="button"
                  onClick={() => setSettingsTab("general")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                    settingsTab === "general"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Appearance &amp; Invite
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("branding")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    settingsTab === "branding"
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" /> Branding &amp; Plan
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("credentials")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                    settingsTab === "credentials"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Credentials
                </button>
              </div>

              {settingsTab === "general" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-foreground block mb-1.5">Bot Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-foreground block mb-1.5">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="What does your bot do?"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-background border border-border">
                    <div>
                      <div className="font-semibold text-foreground">Bot Enabled</div>
                      <div className="text-[11px] text-muted-foreground">
                        When enabled, your bot stays online and responds to slash commands
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={editEnabled}
                      onChange={(e) => setEditEnabled(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-background border border-border space-y-3">
                    <div className="font-semibold text-foreground">Invite &amp; Discord Links</div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={getAppInviteUrl(settingsApp.discord_id, "guild")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold transition"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add App to Server
                      </a>
                      <a
                        href={getAppInviteUrl(settingsApp.discord_id, "user")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground font-semibold transition"
                      >
                        Add App to Account
                      </a>
                      <a
                        href={`https://discord.com/developers/applications/${settingsApp.discord_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-accent text-foreground font-medium transition"
                      >
                        Manage on Discord <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === "branding" && (
                <div className="space-y-4 text-xs">
                  {/* Dodo Payments Test Mode Banner */}
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-mono font-bold text-[10px] uppercase tracking-wider border border-amber-500/30">
                          Dodo Payments · {billingStatus?.environment === "live_mode" ? "LIVE MODE" : "TEST MODE"}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {billingStatus?.base_url || "https://test.dodopayments.com"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDodoShowConfig((v) => !v)}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        {dodoShowConfig
                          ? "Hide API Key Setup"
                          : billingStatus?.api_key_configured
                          ? `Key Connected (${billingStatus.api_key_masked})`
                          : "Connect dodo_test_... Key"}
                      </button>
                    </div>

                    {settingsApp.dodo_subscription_id && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-500/20 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Subscription:</span>
                          <code className="font-mono text-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border">
                            {settingsApp.dodo_subscription_id}
                          </code>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold uppercase text-[10px]">
                            {settingsApp.subscription_status || "active"}
                          </span>
                          {settingsApp.cancel_at_next_billing_date && (
                            <span className="text-amber-400 text-[10px]">
                              (Cancels at period end)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {dodoShowConfig && (
                      <div className="pt-2.5 border-t border-amber-500/20 space-y-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-foreground mb-1">
                            Dodo Payments Test API Key (Optional — for hosted redirect on test.checkout.dodopayments.com)
                          </label>
                          <input
                            type="password"
                            placeholder="dodo_test_..."
                            value={dodoApiKeyInput}
                            onChange={(e) => setDodoApiKeyInput(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-foreground mb-1">
                            Dodo Webhook Signing Secret (Standard Webhooks whsec_...)
                          </label>
                          <input
                            type="password"
                            placeholder="whsec_..."
                            value={dodoWebhookKeyInput}
                            onChange={(e) => setDodoWebhookKeyInput(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground truncate">
                            Webhook URL: <code className="font-mono">{billingStatus?.webhook_endpoint}</code>
                          </span>
                          <button
                            type="button"
                            disabled={dodoConfigMutation.isPending}
                            onClick={() => dodoConfigMutation.mutate()}
                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold shrink-0"
                          >
                            {dodoConfigMutation.isPending ? "Saving..." : "Save Dodo Config"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Plan Selector */}
                  <div>
                    <label className="font-semibold text-foreground block mb-2">
                      Select Subscription Tier
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditPlan("free");
                          setEditCustomBranding(false);
                        }}
                        className={`p-3 rounded-xl border text-left transition ${
                          editPlan === "free"
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <div className="font-bold text-foreground">Starter</div>
                        <div className="text-base font-extrabold text-foreground mt-0.5">$0</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Includes Veloce Branding
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditPlan("pro");
                          setEditCustomBranding(true);
                        }}
                        className={`p-3 rounded-xl border text-left transition relative ${
                          editPlan === "pro"
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                          POPULAR
                        </span>
                        <div className="font-bold text-foreground">Pro</div>
                        <div className="text-base font-extrabold text-primary mt-0.5">
                          $5.99<span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Unlocks Custom Branding
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditPlan("studio");
                          setEditCustomBranding(true);
                        }}
                        className={`p-3 rounded-xl border text-left transition ${
                          editPlan === "studio"
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <div className="font-bold text-foreground">Studio</div>
                        <div className="text-base font-extrabold text-primary mt-0.5">
                          $14.99<span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          White-Label &amp; Unlimited
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Dodo Payments Test Mode Checkout & Card Simulator */}
                  {(editPlan === "pro" || editPlan === "studio") && (
                    <div className="p-4 rounded-xl bg-background border border-primary/40 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-primary" />
                            <span>
                              Dodo Payments Test Mode Checkout —{" "}
                              {editPlan === "studio" ? "Studio ($14.99/mo)" : "Pro ($5.99/mo)"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Test card success/decline scenarios, UPI, renewals, and verified Standard Webhooks (`client.webhooks.unwrap()`).
                          </p>
                        </div>

                        {billingStatus?.api_key_configured && (
                          <button
                            type="button"
                            disabled={dodoCheckoutMutation.isPending}
                            onClick={() => dodoCheckoutMutation.mutate(editPlan)}
                            className="px-3 py-2 rounded-lg bg-secondary hover:bg-accent text-foreground border border-border font-semibold text-[11px] inline-flex items-center gap-1.5 shrink-0"
                          >
                            <span>Hosted Checkout</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-8">
                          <label className="block text-[11px] text-muted-foreground mb-1">
                            Official Dodo Test Card / Payment Method (Exp 06/32 · CVV 123)
                          </label>
                          <select
                            value={dodoSelectedCard}
                            onChange={(e) => setDodoSelectedCard(e.target.value)}
                            className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-xs text-foreground font-mono"
                          >
                            <option value="4242424242424242">
                              4242 4242 4242 4242 — Success (subscription.active)
                            </option>
                            <option value="4000000000000002">
                              4000 0000 0000 0002 — Decline (payment.failed)
                            </option>
                            <option value="4000000000009995">
                              4000 0000 0000 9995 — Insufficient Funds (payment.failed)
                            </option>
                            <option value="4000000000000341">
                              4000 0000 0000 0341 — Renewal Failure (subscription.on_hold)
                            </option>
                            <option value="success@upi">
                              success@upi — UPI Payment Success (subscription.active)
                            </option>
                            <option value="failure@upi">
                              failure@upi — UPI Payment Failure (payment.failed)
                            </option>
                          </select>
                        </div>

                        <div className="sm:col-span-4">
                          <button
                            type="button"
                            disabled={dodoTestWebhookMutation.isPending}
                            onClick={() => {
                              const isUpi = dodoSelectedCard.includes("@upi");
                              dodoTestWebhookMutation.mutate({
                                plan: editPlan,
                                ...(isUpi
                                  ? { upi_vpa: dodoSelectedCard }
                                  : { card_number: dodoSelectedCard }),
                              });
                            }}
                            className="w-full py-2 px-3 rounded-lg bg-primary hover:opacity-95 disabled:opacity-50 text-primary-foreground font-semibold text-xs shadow transition"
                          >
                            {dodoTestWebhookMutation.isPending
                              ? "Verifying Webhook..."
                              : `Pay ${editPlan === "studio" ? "$14.99" : "$5.99"} (Test)`}
                          </button>
                        </div>
                      </div>

                      {/* Lifecycle Webhook Simulators (Cancel at period end / Refund) */}
                      {isPaidPlan && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                          <span className="text-[11px] text-muted-foreground">
                            Test Subscription Lifecycle:
                          </span>
                          <button
                            type="button"
                            disabled={dodoTestWebhookMutation.isPending}
                            onClick={() =>
                              dodoTestWebhookMutation.mutate({
                                plan: (settingsApp.plan as "pro" | "studio") || "pro",
                                scenario: "cancel_period_end",
                              })
                            }
                            className="px-2.5 py-1 rounded-md bg-secondary hover:bg-accent text-foreground border border-border text-[11px] font-medium transition"
                          >
                            Cancel at Period End
                          </button>
                          <button
                            type="button"
                            disabled={dodoTestWebhookMutation.isPending}
                            onClick={() =>
                              dodoTestWebhookMutation.mutate({
                                plan: (settingsApp.plan as "pro" | "studio") || "pro",
                                scenario: "refund",
                              })
                            }
                            className="px-2.5 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-[11px] font-medium transition"
                          >
                            Simulate 14-Day Refund (refund.succeeded)
                          </button>
                        </div>
                      )}

                      {lastWebhookResult && (
                        <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-emerald-400 font-semibold">
                              ✓ Standard Webhooks Signature Verified (client.webhooks.unwrap)
                            </span>
                            <span className="text-muted-foreground">
                              {lastWebhookResult.webhook_id}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            Event: <span className="text-foreground font-semibold">{lastWebhookResult.event_type}</span> · Scenario:{" "}
                            <span className="text-foreground">{lastWebhookResult.scenario}</span> · Active Plan:{" "}
                            <span className="text-primary font-bold uppercase">
                              {lastWebhookResult.app?.plan || settingsApp.plan}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom Branding Toggle (Locked on Free Plan) */}
                  <div
                    className={`p-4 rounded-xl border ${
                      isPaidPlan
                        ? "bg-background border-primary/40"
                        : "bg-background/60 border-border opacity-85"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          {!isPaidPlan && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                          Remove &quot;Powered by Veloce&quot; Branding
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {isPaidPlan
                            ? "Custom branding unlocked via Dodo Payments! Your bot replies and status are 100% white-labeled."
                            : "Free bots show '⚡ Powered by Veloce' on bot status and replies. Complete a Dodo Payments Test Checkout above to unlock custom branding."}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        disabled={!isPaidPlan}
                        checked={isPaidPlan && editCustomBranding}
                        onChange={(e) => setEditCustomBranding(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Custom Bot Presence / Status */}
                  <div
                    className={`p-4 rounded-xl border space-y-3 ${
                      isPaidPlan ? "bg-background border-border" : "bg-background/50 border-border opacity-75"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        {!isPaidPlan && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                        Custom Bot Status &amp; Presence
                      </span>
                      {!isPaidPlan && (
                        <span className="text-[10px] font-semibold text-amber-400">
                          Requires Pro ($5.99/mo)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">
                          Online Status
                        </label>
                        <select
                          disabled={!isPaidPlan}
                          value={editPresenceStatus}
                          onChange={(e) => setEditPresenceStatus(e.target.value as any)}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground disabled:opacity-50"
                        >
                          <option value="online">🟢 Online</option>
                          <option value="idle">🌙 Idle</option>
                          <option value="dnd">⛔ Do Not Disturb</option>
                          <option value="invisible">⚪ Invisible</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">
                          Activity Type
                        </label>
                        <select
                          disabled={!isPaidPlan}
                          value={editActivityType}
                          onChange={(e) => setEditActivityType(parseInt(e.target.value, 10))}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground disabled:opacity-50"
                        >
                          <option value={0}>Playing...</option>
                          <option value={2}>Listening to...</option>
                          <option value={3}>Watching...</option>
                          <option value={4}>Custom Status</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        Activity Text
                      </label>
                      <input
                        type="text"
                        disabled={!isPaidPlan}
                        value={isPaidPlan ? editActivityName : "⚡ Powered by Veloce"}
                        onChange={(e) => setEditActivityName(e.target.value)}
                        placeholder="e.g. /help | Moderating Server"
                        className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === "credentials" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-foreground block mb-1.5">
                      Discord Public Key (64-character hex)
                    </label>
                    <input
                      type="text"
                      value={editPublicKey}
                      onChange={(e) => setEditPublicKey(e.target.value)}
                      placeholder="e.g. 0bbb1fec..."
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-foreground block mb-1.5">
                      Update Bot Token (Leave blank to keep current token)
                    </label>
                    <input
                      type="password"
                      value={editToken}
                      onChange={(e) => setEditToken(e.target.value)}
                      placeholder="New Discord Bot Token..."
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSettingsApp(null)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={updateAppMutation.isPending}
                  onClick={() => updateAppMutation.mutate()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:opacity-95 disabled:opacity-50 text-primary-foreground shadow transition"
                >
                  {updateAppMutation.isPending ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
