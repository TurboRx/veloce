import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import {
  Zap,
  ShieldAlert,
  ShieldCheck,
  Users,
  Bot,
  Key,
  Ban,
  CheckCircle2,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Search,
  Activity,
  FileText,
  ArrowLeft,
  Lock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  api,
  StaffRole,
  AdminOverviewResponse,
  AdminBotRecord,
  Log,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/useAuth";
import { AuthBarrier } from "@/components/auth/AuthBarrier";
import { ThemeSwitch } from "@/components/common/ThemeSwitch";

const ROLE_RANK: Record<StaffRole, number> = {
  USER: 1,
  SUPPORT: 2,
  MODERATOR: 3,
  ADMIN: 4,
  FOUNDER: 5,
};

function hasRole(userRole: StaffRole | undefined, minRole: StaffRole): boolean {
  if (!userRole) return false;
  return (ROLE_RANK[userRole] || 1) >= (ROLE_RANK[minRole] || 1);
}

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: authLoading } = useCurrentUser();

  const [activeTab, setActiveTab] = useState<
    "roles" | "bots" | "users" | "radar" | "audit"
  >("bots");

  // 1. Role & Staff Access Manager State (FOUNDER Only)
  const [staffDiscordId, setStaffDiscordId] = useState("");
  const [staffUsername, setStaffUsername] = useState("");
  const [staffTargetRole, setStaffTargetRole] = useState<StaffRole>("ADMIN");

  // 2. Global Bot Inspector & Token Vault State
  const [botSearch, setBotSearch] = useState("");
  const [revealedTokens, setRevealedTokens] = useState<Record<string, string>>({});
  const [copiedBotId, setCopiedBotId] = useState<string | null>(null);
  const [inspectingBot, setInspectingBot] = useState<AdminBotRecord | null>(null);

  // 3. User Directory & Plan Override State
  const [userSearch, setUserSearch] = useState("");

  const isAuthorizedStaff = Boolean(user && user.role && user.role !== "USER");

  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useQuery<AdminOverviewResponse>({
    queryKey: ["admin-overview"],
    queryFn: () => api.getAdminOverview(),
    enabled: isAuthorizedStaff,
    retry: false,
  });

  const { data: botLogs, isLoading: botLogsLoading } = useQuery<Log[]>({
    queryKey: ["admin-bot-logs", inspectingBot?.id],
    queryFn: () => api.getAdminBotLogs(inspectingBot!.id),
    enabled: Boolean(inspectingBot?.id && isAuthorizedStaff),
    retry: false,
  });

  // Mutations
  const assignRoleMutation = useMutation({
    mutationFn: (payload: { discord_id: string; role: StaffRole; username?: string }) =>
      api.assignStaffRole(payload),
    onSuccess: (res) => {
      toast.success(
        `Assigned ${res.user.role} role to Discord ID ${res.user.discord_id}`
      );
      setStaffDiscordId("");
      setStaffUsername("");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update staff role");
    },
  });

  const suspendBotMutation = useMutation({
    mutationFn: ({ botId, enabled }: { botId: string; enabled: boolean }) =>
      api.suspendAdminBot(botId, enabled),
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? "Bot re-enabled" : "Bot disconnected & suspended");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update bot status");
    },
  });

  const revealTokenMutation = useMutation({
    mutationFn: (botId: string) => api.revealBotToken(botId),
    onSuccess: (res) => {
      if (res.bot_token) {
        setRevealedTokens((prev) => ({ ...prev, [res.bot_id]: res.bot_token! }));
        toast.success(`Decrypted token for ${res.bot_name} (logged to audit trail)`);
      } else {
        toast.warning("No raw token stored for this bot");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to reveal bot token");
    },
  });

  const purgeBotMutation = useMutation({
    mutationFn: (botId: string) => api.purgeAdminBot(botId),
    onSuccess: () => {
      toast.success("Bot permanently purged and commands cleared from Discord");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to purge bot");
    },
  });

  const overrideUserMutation = useMutation({
    mutationFn: ({
      discordId,
      plan,
      extra_bot_slots,
      is_banned,
    }: {
      discordId: string;
      plan?: "free" | "pro" | "studio";
      extra_bot_slots?: number;
      is_banned?: boolean;
    }) => api.overrideAdminUser(discordId, { plan, extra_bot_slots, is_banned }),
    onSuccess: (res) => {
      toast.success(`Updated user ${res.user.discord_username} (${res.user.discord_id})`);
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to override user account");
    },
  });

  const emergencyBanPurgeMutation = useMutation({
    mutationFn: ({ discordId, reason }: { discordId: string; reason?: string }) =>
      api.emergencyBanAndPurge(discordId, reason),
    onSuccess: (res) => {
      toast.success(
        `Emergency Ban executed for ${res.discord_id}: ${res.purged_bots_count} bots terminated & purged.`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Emergency ban & purge failed");
    },
  });

  if (!authLoading && !user) {
    return (
      <>
        <Head>
          <title>Staff Authentication Required - Veloce</title>
        </Head>
        <AuthBarrier
          redirectTo="/super-admin"
          title="Staff Authentication Required"
          description="Sign in with your authorized Discord account to access the Veloce Super Admin & Staff Panel."
        />
      </>
    );
  }

  // Return 403 Forbidden to any USER trying to access /super-admin
  if (!authLoading && user && user.role === "USER") {
    return (
      <>
        <Head>
          <title>403 Forbidden - Veloce</title>
        </Head>
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-rose-500/30 p-8 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              HTTP 403 FORBIDDEN
            </span>
            <h1 className="text-xl font-bold text-foreground mt-3">
              Staff Clearance Required
            </h1>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Your Discord account (<code className="font-mono">{user.discord_id}</code>) holds the{" "}
              <strong className="text-foreground">USER</strong> rank and does not have permission to
              access <code className="font-mono">/super-admin</code>.
            </p>
            <div className="mt-6">
              <Link
                href="/apps"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const viewerRole: StaffRole = overview?.viewer?.role || user?.role || "USER";
  const isFounder = viewerRole === "FOUNDER";
  const isAdminOrAbove = hasRole(viewerRole, "ADMIN");
  const isModOrAbove = hasRole(viewerRole, "MODERATOR");
  const founderDiscordId = overview?.founder_discord_id || "1294554358905831459";

  const filteredBots = (overview?.bots || []).filter((b) => {
    if (!botSearch.trim()) return true;
    const q = botSearch.toLowerCase();
    return (
      b.name?.toLowerCase().includes(q) ||
      b.discord_id?.toLowerCase().includes(q) ||
      b.user_id?.toLowerCase().includes(q) ||
      b.owner_username?.toLowerCase().includes(q)
    );
  });

  const filteredUsers = (overview?.users || []).filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.discord_id?.toLowerCase().includes(q) ||
      u.discord_username?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Head>
        <title>Super Admin &amp; Staff Panel - Veloce</title>
      </Head>

      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {/* Top Bar */}
        <header className="border-b border-border px-4 sm:px-6 py-3.5 flex items-center justify-between bg-background/85 backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Link href="/apps" className="flex items-center gap-2">
              <div className="p-2 bg-primary/15 rounded-xl border border-primary/25 text-primary">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <span className="font-bold text-base tracking-tight">VELOCE</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              Super Admin &amp; Staff Panel
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeSwitch />
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold">
              RANK: {viewerRole}
            </span>
            <button
              type="button"
              onClick={() => refetchOverview()}
              className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition"
              title="Refresh telemetry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <Link
              href="/apps"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-xs font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
          </div>
        </header>

        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground">Total Registered Users</div>
              <div className="text-2xl font-extrabold text-foreground mt-1">
                {overview?.users?.length ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground">Global Connected Bots</div>
              <div className="text-2xl font-extrabold text-primary mt-1">
                {overview?.bots?.length ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground">Staff Members</div>
              <div className="text-2xl font-extrabold text-amber-400 mt-1">
                {(overview?.users || []).filter((u) => u.role !== "USER").length}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground">Audit Log Entries</div>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                {overview?.audit_logs?.length ?? 0}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            {isFounder && (
              <button
                type="button"
                onClick={() => setActiveTab("roles")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === "roles"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                1. Role &amp; Staff Access Manager (FOUNDER)
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab("bots")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === "bots"
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              2. Global Bot Inspector &amp; Token Vault
            </button>

            {isAdminOrAbove && (
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === "users"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                3. User Directory &amp; Plan Override
              </button>
            )}

            {isModOrAbove && (
              <button
                type="button"
                onClick={() => setActiveTab("radar")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === "radar"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                4. Abuse &amp; Rate-Limit Radar
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === "audit"
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              5. Immutable Staff Audit Logs
            </button>
          </div>

          {overviewLoading ? (
            <div className="h-64 rounded-2xl bg-card border border-border animate-pulse" />
          ) : (
            <>
              {/* 1. Role & Staff Access Manager (FOUNDER Only) */}
              {activeTab === "roles" && isFounder && (
                <div className="space-y-6">
                  <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
                    <div>
                      <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        Pre-Authorize or Assign Staff Rank (FOUNDER Only)
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter any Discord User ID (even before their first login) to grant or revoke{" "}
                        <code className="font-mono">ADMIN</code>,{" "}
                        <code className="font-mono">MODERATOR</code>,{" "}
                        <code className="font-mono">SUPPORT</code>, or{" "}
                        <code className="font-mono">USER</code> access in 1 click.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Discord User ID (Snowflake)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 1294554358905831459"
                          value={staffDiscordId}
                          onChange={(e) => setStaffDiscordId(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Label / Username (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. alex_mod"
                          value={staffUsername}
                          onChange={(e) => setStaffUsername(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Target Rank
                        </label>
                        <select
                          value={staffTargetRole}
                          onChange={(e) => setStaffTargetRole(e.target.value as StaffRole)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="MODERATOR">MODERATOR</option>
                          <option value="SUPPORT">SUPPORT</option>
                          <option value="USER">USER (Revoke Staff)</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={!staffDiscordId.trim() || assignRoleMutation.isPending}
                        onClick={() =>
                          assignRoleMutation.mutate({
                            discord_id: staffDiscordId.trim(),
                            role: staffTargetRole,
                            username: staffUsername.trim() || undefined,
                          })
                        }
                        className="py-2 px-4 rounded-lg bg-primary hover:opacity-95 disabled:opacity-50 text-primary-foreground text-xs font-semibold shadow transition"
                      >
                        {assignRoleMutation.isPending ? "Updating..." : "Assign Role"}
                      </button>
                    </div>
                  </div>

                  {/* Quick 1-Click Staff Roster */}
                  <div className="rounded-2xl bg-card border border-border p-6">
                    <h3 className="text-sm font-bold text-foreground mb-4">
                      Current Staff &amp; Users — 1-Click Role Switcher
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="py-2.5 pr-4">User</th>
                            <th className="py-2.5 px-4">Discord ID</th>
                            <th className="py-2.5 px-4">Current Rank</th>
                            <th className="py-2.5 pl-4 text-right">1-Click Role Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {(overview?.users || []).map((u) => {
                            const isTargetFounder = u.discord_id === founderDiscordId;
                            return (
                              <tr key={u.id}>
                                <td className="py-3 pr-4 font-semibold text-foreground">
                                  {u.display_name}{" "}
                                  <span className="text-muted-foreground font-normal">
                                    (@{u.discord_username})
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono text-muted-foreground">
                                  {u.discord_id}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                      u.role === "FOUNDER"
                                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                        : u.role !== "USER"
                                        ? "bg-primary/15 text-primary border border-primary/30"
                                        : "bg-secondary text-muted-foreground"
                                    }`}
                                  >
                                    {u.role}
                                  </span>
                                </td>
                                <td className="py-3 pl-4 text-right">
                                  {isTargetFounder ? (
                                    <span className="text-[11px] text-amber-400 font-semibold">
                                      Immutable Founder
                                    </span>
                                  ) : (
                                    <div className="inline-flex flex-wrap gap-1.5 justify-end">
                                      {(["ADMIN", "MODERATOR", "SUPPORT", "USER"] as StaffRole[]).map(
                                        (r) => (
                                          <button
                                            key={r}
                                            type="button"
                                            disabled={u.role === r || assignRoleMutation.isPending}
                                            onClick={() =>
                                              assignRoleMutation.mutate({
                                                discord_id: u.discord_id,
                                                role: r,
                                                username: u.discord_username,
                                              })
                                            }
                                            className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                                              u.role === r
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary hover:bg-accent text-foreground"
                                            }`}
                                          >
                                            {r}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Global Bot Inspector & Token Vault */}
              {activeTab === "bots" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-foreground">
                        Global Bot Inspector &amp; Token Vault
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        SUPPORT+ can inspect metadata &amp; logs · MODERATOR+ can suspend bots · FOUNDER ONLY can reveal raw tokens or purge bots.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search bot name, ID, or owner..."
                        value={botSearch}
                        onChange={(e) => setBotSearch(e.target.value)}
                        className="w-full bg-card border border-border rounded-xl pl-8 pr-3 py-2 text-xs text-foreground"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-card border border-border overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-3 px-4">Bot</th>
                          <th className="py-3 px-4">Owner Discord ID</th>
                          <th className="py-3 px-4">Status / Plan</th>
                          <th className="py-3 px-4">Token Vault</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredBots.map((bot) => {
                          const revealed = revealedTokens[bot.id];
                          return (
                            <tr key={bot.id}>
                              <td className="py-3 px-4">
                                <div className="font-bold text-foreground">{bot.name}</div>
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  App: {bot.id} · Discord: {bot.discord_id}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">
                                {bot.user_id || bot.owner_user_id}
                                {bot.owner_username && (
                                  <span className="block text-[10px] text-foreground">
                                    @{bot.owner_username}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      bot.enabled
                                        ? "bg-emerald-500/15 text-emerald-400"
                                        : "bg-rose-500/15 text-rose-400"
                                    }`}
                                  >
                                    {bot.enabled ? "ONLINE" : "SUSPENDED"}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-secondary text-foreground">
                                    {bot.plan || "free"}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-1">
                                  {bot.command_count} commands · {bot.error_count} errors
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <code className="font-mono text-[11px] bg-background px-2 py-1 rounded border border-border">
                                    {revealed || bot.token_preview || "No token"}
                                  </code>
                                  {isFounder && bot.has_token && (
                                    <>
                                      {!revealed ? (
                                        <button
                                          type="button"
                                          onClick={() => revealTokenMutation.mutate(bot.id)}
                                          disabled={revealTokenMutation.isPending}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[10px] font-semibold transition"
                                          title="FOUNDER Only: Reveal raw token"
                                        >
                                          <Eye className="w-3 h-3" /> Reveal
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              navigator.clipboard.writeText(revealed);
                                              setCopiedBotId(bot.id);
                                              toast.success("Bot token copied");
                                              setTimeout(() => setCopiedBotId(null), 2000);
                                            }}
                                            className="p-1 rounded bg-secondary hover:bg-accent text-foreground"
                                            title="Copy token"
                                          >
                                            {copiedBotId === bot.id ? (
                                              <Check className="w-3 h-3 text-emerald-400" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setRevealedTokens((prev) => {
                                                const next = { ...prev };
                                                delete next[bot.id];
                                                return next;
                                              })
                                            }
                                            className="p-1 rounded bg-secondary hover:bg-accent text-muted-foreground"
                                            title="Hide token"
                                          >
                                            <EyeOff className="w-3 h-3" />
                                          </button>
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setInspectingBot(bot)}
                                    className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-accent text-foreground text-[11px] font-semibold transition"
                                  >
                                    Logs
                                  </button>

                                  {isModOrAbove && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        suspendBotMutation.mutate({
                                          botId: bot.id,
                                          enabled: !bot.enabled,
                                        })
                                      }
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                                        bot.enabled
                                          ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30"
                                          : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                                      }`}
                                    >
                                      {bot.enabled ? "Disconnect / Suspend" : "Re-Enable"}
                                    </button>
                                  )}

                                  {isFounder && (
                                    <button
                                      type="button"
                                      onClick={() => purgeBotMutation.mutate(bot.id)}
                                      className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition"
                                      title="FOUNDER Only: Permanently purge bot"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {inspectingBot && (
                    <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-foreground">
                          Telemetry &amp; Error Logs — {inspectingBot.name} ({inspectingBot.id})
                        </h3>
                        <button
                          type="button"
                          onClick={() => setInspectingBot(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Close Logs
                        </button>
                      </div>
                      {botLogsLoading ? (
                        <div className="text-xs text-muted-foreground">Loading bot logs...</div>
                      ) : !botLogs || botLogs.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No logs recorded for this bot.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto font-mono text-[11px]">
                          {botLogs.map((l) => (
                            <div
                              key={l.id}
                              className="p-2 rounded bg-background border border-border flex items-center justify-between gap-3"
                            >
                              <div>
                                <span
                                  className={`uppercase font-bold mr-2 ${
                                    l.level === "error"
                                      ? "text-rose-400"
                                      : l.level === "warn"
                                      ? "text-amber-400"
                                      : "text-emerald-400"
                                  }`}
                                >
                                  [{l.level}]
                                </span>
                                <span className="text-foreground">{l.message}</span>
                              </div>
                              <span className="text-muted-foreground shrink-0">
                                {new Date(l.created_at).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 3. User Directory & Plan Override (ADMIN & FOUNDER) */}
              {activeTab === "users" && isAdminOrAbove && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-foreground">
                        User Directory &amp; Plan Override
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Search users by Discord ID or username, manually override plans (Starter / Pro / Studio), grant extra bot slots, or 1-Click Ban/Unban.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search Discord ID or username..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full bg-card border border-border rounded-xl pl-8 pr-3 py-2 text-xs text-foreground"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-card border border-border overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">Discord ID</th>
                          <th className="py-3 px-4">Bots</th>
                          <th className="py-3 px-4">Plan Override</th>
                          <th className="py-3 px-4">Extra Bot Slots</th>
                          <th className="py-3 px-4 text-right">1-Click Ban / Unban</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredUsers.map((u) => {
                          const isTargetFounder = u.discord_id === founderDiscordId;
                          return (
                            <tr key={u.id}>
                              <td className="py-3 px-4">
                                <div className="font-bold text-foreground flex items-center gap-1.5">
                                  <span>{u.display_name}</span>
                                  {u.is_banned && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-mono">
                                      BANNED
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  @{u.discord_username} · {u.role}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">
                                {u.discord_id}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-foreground">
                                {u.bot_count}
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  disabled={isTargetFounder && !isFounder}
                                  value={u.plan || "free"}
                                  onChange={(e) =>
                                    overrideUserMutation.mutate({
                                      discordId: u.discord_id,
                                      plan: e.target.value as "free" | "pro" | "studio",
                                    })
                                  }
                                  className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-semibold text-foreground"
                                >
                                  <option value="free">Starter (Free)</option>
                                  <option value="pro">Pro ($5.99/mo)</option>
                                  <option value="studio">Studio ($14.99/mo)</option>
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-foreground">
                                    +{u.extra_bot_slots || 0}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      overrideUserMutation.mutate({
                                        discordId: u.discord_id,
                                        extra_bot_slots: (u.extra_bot_slots || 0) + 10,
                                      })
                                    }
                                    className="px-2 py-0.5 rounded bg-primary/15 hover:bg-primary/25 text-primary text-[10px] font-semibold"
                                  >
                                    +10 Slots
                                  </button>
                                  {(u.extra_bot_slots || 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        overrideUserMutation.mutate({
                                          discordId: u.discord_id,
                                          extra_bot_slots: Math.max(0, (u.extra_bot_slots || 0) - 10),
                                        })
                                      }
                                      className="px-2 py-0.5 rounded bg-secondary hover:bg-accent text-muted-foreground text-[10px]"
                                    >
                                      -10
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isTargetFounder ? (
                                  <span className="text-[11px] text-amber-400 font-semibold">
                                    Protected Founder
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      overrideUserMutation.mutate({
                                        discordId: u.discord_id,
                                        is_banned: !u.is_banned,
                                      })
                                    }
                                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                                      u.is_banned
                                        ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                                        : "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30"
                                    }`}
                                  >
                                    {u.is_banned ? (
                                      <>
                                        <CheckCircle2 className="w-3 h-3" /> Unban User
                                      </>
                                    ) : (
                                      <>
                                        <Ban className="w-3 h-3" /> Ban User
                                      </>
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. Abuse & Rate-Limit Radar (MODERATOR, ADMIN, FOUNDER) */}
              {activeTab === "radar" && isModOrAbove && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      Abuse &amp; Rate-Limit Radar
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Real-time monitoring of interaction spikes and Discord HTTP 429 rate-limit anomalies with a 1-click emergency kill switch.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-card border border-border overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-3 px-4">Bot</th>
                          <th className="py-3 px-4">Owner Discord ID</th>
                          <th className="py-3 px-4">Events (24h)</th>
                          <th className="py-3 px-4">Discord 429 Spikes</th>
                          <th className="py-3 px-4">Errors</th>
                          <th className="py-3 px-4 text-right">Emergency Kill Switch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {(overview?.abuse_radar || []).map((item) => {
                          const isOwnerFounder = item.owner_discord_id === founderDiscordId;
                          return (
                            <tr key={item.app_id}>
                              <td className="py-3 px-4">
                                <div className="font-bold text-foreground">{item.bot_name}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {item.app_id}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">
                                {item.owner_discord_id}
                                {item.owner_username && (
                                  <span className="block text-[10px] text-foreground">
                                    @{item.owner_username}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-foreground">
                                {item.total_events_1h}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                                    item.rate_limit_429_count > 0
                                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                                      : "bg-secondary text-muted-foreground"
                                  }`}
                                >
                                  {item.rate_limit_429_count} (429s)
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono text-amber-400">
                                {item.error_count}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isOwnerFounder ? (
                                  <span className="text-[11px] text-amber-400 font-semibold">
                                    Founder Protected
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={emergencyBanPurgeMutation.isPending}
                                    onClick={() =>
                                      emergencyBanPurgeMutation.mutate({
                                        discordId: item.owner_discord_id,
                                        reason: `Emergency Ban & Purge triggered from Abuse Radar on bot ${item.bot_name}`,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold shadow transition"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Ban User &amp; Purge All Bots
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Immutable Staff Audit Logs */}
              {activeTab === "audit" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      Immutable Staff Audit Logs
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cryptographic, append-only record of every staff action (actor Discord ID, role, target ID, action type, IP address, and timestamp).
                    </p>
                  </div>

                  <div className="rounded-2xl bg-card border border-border overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-3 px-4">Timestamp</th>
                          <th className="py-3 px-4">Actor</th>
                          <th className="py-3 px-4">Action Type</th>
                          <th className="py-3 px-4">Target ID</th>
                          <th className="py-3 px-4">IP Address</th>
                          <th className="py-3 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                        {(overview?.audit_logs || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-muted-foreground font-sans">
                              No staff audit actions recorded yet.
                            </td>
                          </tr>
                        ) : (
                          (overview?.audit_logs || []).map((log) => (
                            <tr key={log.id}>
                              <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-foreground font-bold">
                                  {log.actor_username}
                                </span>{" "}
                                <span className="text-amber-400">[{log.actor_role}]</span>
                                <div className="text-[10px] text-muted-foreground">
                                  {log.actor_discord_id}
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-bold">
                                  {log.action_type}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-foreground">{log.target_id}</td>
                              <td className="py-2.5 px-4 text-muted-foreground">
                                {log.ip_address}
                              </td>
                              <td className="py-2.5 px-4 text-muted-foreground max-w-xs truncate">
                                {JSON.stringify(log.details || {})}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
