import { useState, useMemo } from "react";
import PublicLayout from "@/components/common/PublicLayout";
import {
  Wrench,
  Shield,
  Clock,
  Hash,
  Copy,
  Check,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

interface PermissionItem {
  name: string;
  shift: number;
  category: "general" | "text" | "voice";
}

const bit = (shift: number): bigint => BigInt(1) << BigInt(shift);

const DISCORD_PERMISSIONS: PermissionItem[] = [
  { name: "Administrator", shift: 3, category: "general" },
  { name: "Manage Server (Guild)", shift: 5, category: "general" },
  { name: "Manage Roles", shift: 28, category: "general" },
  { name: "Manage Channels", shift: 4, category: "general" },
  { name: "Kick Members", shift: 1, category: "general" },
  { name: "Ban Members", shift: 2, category: "general" },
  { name: "Moderate Members (Timeout)", shift: 40, category: "general" },
  { name: "View Audit Log", shift: 7, category: "general" },
  { name: "View Channels", shift: 10, category: "general" },
  { name: "Create Instant Invite", shift: 0, category: "general" },
  { name: "Manage Nicknames", shift: 27, category: "general" },
  { name: "Manage Webhooks", shift: 29, category: "general" },

  { name: "Send Messages", shift: 11, category: "text" },
  { name: "Send Messages in Threads", shift: 38, category: "text" },
  { name: "Embed Links", shift: 14, category: "text" },
  { name: "Attach Files", shift: 15, category: "text" },
  { name: "Add Reactions", shift: 6, category: "text" },
  { name: "Use External Emojis", shift: 18, category: "text" },
  { name: "Mention @everyone / Roles", shift: 17, category: "text" },
  { name: "Manage Messages", shift: 13, category: "text" },
  { name: "Manage Threads", shift: 34, category: "text" },
  { name: "Read Message History", shift: 16, category: "text" },
  { name: "Use Application Commands", shift: 31, category: "text" },

  { name: "Connect (Voice)", shift: 20, category: "voice" },
  { name: "Speak", shift: 21, category: "voice" },
  { name: "Mute Members", shift: 22, category: "voice" },
  { name: "Deafen Members", shift: 23, category: "voice" },
  { name: "Move Members", shift: 24, category: "voice" },
  { name: "Use Voice Activity", shift: 25, category: "voice" },
];

const DISCORD_EPOCH = BigInt("1420070400000");

export default function DiscordToolsPage() {
  const [activeTool, setActiveTool] = useState<"permissions" | "timestamp" | "snowflake">(
    "permissions"
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 1. Permissions Calculator State
  const [selectedBits, setSelectedBits] = useState<bigint>(() =>
    bit(10) | bit(11) | bit(14) | bit(16) | bit(31)
  );
  const [clientId, setClientId] = useState<string>("");

  // 2. Timestamp Generator State
  const [dateTimeInput, setDateTimeInput] = useState<string>(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}`;
  });

  // 3. Snowflake Decoder State
  const [snowflakeInput, setSnowflakeInput] = useState<string>("80351110224678912");

  const copyValue = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const togglePerm = (shift: number) => {
    const b = bit(shift);
    setSelectedBits((prev) => ((prev & b) === b ? prev & ~b : prev | b));
  };

  const inviteUrl = useMemo(() => {
    const cleanId = clientId.trim() || "YOUR_CLIENT_ID";
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
      cleanId
    )}&permissions=${selectedBits.toString()}&scope=bot%20applications.commands`;
  }, [clientId, selectedBits]);

  const unixSeconds = useMemo(() => {
    const parsed = new Date(dateTimeInput).getTime();
    return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
  }, [dateTimeInput]);

  const decodedSnowflake = useMemo(() => {
    const trimmed = snowflakeInput.trim();
    if (!/^\d{15,21}$/.test(trimmed)) return null;
    try {
      const id = BigInt(trimmed);
      const timestampMs = Number((id >> BigInt(22)) + DISCORD_EPOCH);
      const workerId = Number((id & BigInt(0x3e0000)) >> BigInt(17));
      const processId = Number((id & BigInt(0x1f000)) >> BigInt(12));
      const increment = Number(id & BigInt(0xfff));
      const date = new Date(timestampMs);
      return {
        timestampMs,
        unixSec: Math.floor(timestampMs / 1000),
        utcString: date.toUTCString(),
        isoString: date.toISOString(),
        workerId,
        processId,
        increment,
      };
    } catch {
      return null;
    }
  }, [snowflakeInput]);

  return (
    <PublicLayout
      title="Free Discord Tools & Calculators | Veloce"
      description="Free browser-based Discord tools: Bot Permissions & Invite URL Calculator, Dynamic Timestamp Markdown Generator, and Snowflake ID Decoder."
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold mb-4">
            <Wrench className="w-3.5 h-3.5" />
            <span>Free Utilities for Discord Developers &amp; Server Owners</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Discord Tools
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Calculate bot permission integers, generate dynamic Discord timestamp codes, and
            decode Snowflake IDs directly in your browser.
          </p>
        </div>

        {/* Tool Selector Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <button
            onClick={() => setActiveTool("permissions")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition ${
              activeTool === "permissions"
                ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Permissions &amp; Invite Calculator</span>
          </button>

          <button
            onClick={() => setActiveTool("timestamp")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition ${
              activeTool === "timestamp"
                ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Timestamp Markdown Generator</span>
          </button>

          <button
            onClick={() => setActiveTool("snowflake")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition ${
              activeTool === "snowflake"
                ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Snowflake ID Decoder</span>
          </button>
        </div>

        {/* TOOL 1: PERMISSIONS CALCULATOR */}
        {activeTool === "permissions" && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-card border border-border p-6 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    Bot Permissions &amp; OAuth2 Invite Generator
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Select the permissions your Discord bot needs to compute its bitwise integer
                    and invite link.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedBits(BigInt(8))}
                    className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-xs font-semibold text-foreground border border-border transition"
                  >
                    Admin Only (8)
                  </button>
                  <button
                    onClick={() => setSelectedBits(BigInt(0))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-xs font-semibold text-muted-foreground hover:text-foreground border border-border transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {(["general", "text", "voice"] as const).map((cat) => (
                  <div
                    key={cat}
                    className="rounded-2xl bg-background/60 border border-border p-4 space-y-2.5"
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">
                      {cat === "general"
                        ? "General Server Permissions"
                        : cat === "text"
                        ? "Text Channel Permissions"
                        : "Voice Channel Permissions"}
                    </h3>
                    {DISCORD_PERMISSIONS.filter((p) => p.category === cat).map((perm) => {
                      const b = bit(perm.shift);
                      const checked = (selectedBits & b) === b;
                      return (
                        <label
                          key={perm.name}
                          className="flex items-center gap-2.5 text-xs sm:text-sm text-foreground cursor-pointer select-none py-1"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerm(perm.shift)}
                            className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                          />
                          <span
                            className={
                              checked ? "font-medium text-foreground" : "text-muted-foreground"
                            }
                          >
                            {perm.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Result Bar */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-4 border-t border-border">
                <div className="lg:col-span-4">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Application / Client ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789012345678"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Permissions Integer
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm font-mono font-bold text-primary truncate">
                      {selectedBits.toString()}
                    </div>
                    <button
                      onClick={() => copyValue("permInt", selectedBits.toString())}
                      className="px-3.5 py-2.5 rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition"
                      title="Copy Integer"
                    >
                      {copiedKey === "permInt" ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Generated Bot Invite Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteUrl}
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-mono text-muted-foreground truncate"
                    />
                    <button
                      onClick={() => copyValue("inviteUrl", inviteUrl)}
                      className="px-3.5 py-2.5 rounded-xl bg-primary hover:opacity-95 text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 transition shrink-0"
                    >
                      {copiedKey === "inviteUrl" ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy URL</span>
                        </>
                      )}
                    </button>
                    {clientId.trim() && (
                      <a
                        href={inviteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition"
                        title="Open Invite Link"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TOOL 2: TIMESTAMP GENERATOR */}
        {activeTool === "timestamp" && (
          <div className="rounded-3xl bg-card border border-border p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Discord Dynamic Timestamp Generator
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Pick a date and time below to generate Discord timestamp syntax that automatically
                adapts to every user&apos;s local timezone.
              </p>
            </div>

            <div className="max-w-sm">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Select Date &amp; Time (Your Local Timezone)
              </label>
              <input
                type="datetime-local"
                value={dateTimeInput}
                onChange={(e) => setDateTimeInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {[
                { label: "Relative Time", style: "R", example: "in 5 minutes / 2 hours ago" },
                { label: "Short Time", style: "t", example: "16:20" },
                { label: "Long Time", style: "T", example: "16:20:30" },
                { label: "Short Date", style: "d", example: "20/04/2026" },
                { label: "Long Date", style: "D", example: "20 April 2026" },
                { label: "Short Date/Time", style: "f", example: "20 April 2026 16:20" },
                { label: "Long Date/Time", style: "F", example: "Monday, 20 April 2026 16:20" },
              ].map((fmt) => {
                const syntax = `<t:${unixSeconds}:${fmt.style}>`;
                return (
                  <div
                    key={fmt.style}
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-background/60 border border-border"
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground">{fmt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{fmt.example}</div>
                      <code className="inline-block mt-1.5 text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {syntax}
                      </code>
                    </div>
                    <button
                      onClick={() => copyValue(fmt.style, syntax)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-accent border border-border text-xs font-semibold text-foreground transition"
                    >
                      {copiedKey === fmt.style ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TOOL 3: SNOWFLAKE DECODER */}
        {activeTool === "snowflake" && (
          <div className="rounded-3xl bg-card border border-border p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Discord Snowflake ID Decoder
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Paste any Discord User ID, Server ID, Channel ID, or Message ID to inspect the
                exact millisecond it was created.
              </p>
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Discord Snowflake ID
              </label>
              <input
                type="text"
                value={snowflakeInput}
                onChange={(e) => setSnowflakeInput(e.target.value)}
                placeholder="Paste a 17-19 digit Discord ID..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            {decodedSnowflake ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-background/60 border border-border">
                  <div className="text-xs text-muted-foreground">Created At (UTC)</div>
                  <div className="text-sm font-bold text-foreground mt-1">
                    {decodedSnowflake.utcString}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-background/60 border border-border">
                  <div className="text-xs text-muted-foreground">ISO 8601 Timestamp</div>
                  <div className="text-sm font-mono font-bold text-primary mt-1">
                    {decodedSnowflake.isoString}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-background/60 border border-border">
                  <div className="text-xs text-muted-foreground">Unix Timestamp (Seconds)</div>
                  <div className="text-sm font-mono font-bold text-foreground mt-1">
                    {decodedSnowflake.unixSec}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-background/60 border border-border">
                  <div className="text-xs text-muted-foreground">Internal Worker ID</div>
                  <div className="text-sm font-mono font-bold text-foreground mt-1">
                    {decodedSnowflake.workerId}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-background/60 border border-border">
                  <div className="text-xs text-muted-foreground">Internal Process ID</div>
                  <div className="text-sm font-mono font-bold text-foreground mt-1">
                    {decodedSnowflake.processId}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-background/60 border border-border">
                  <div className="text-xs text-muted-foreground">Sequence Increment</div>
                  <div className="text-sm font-mono font-bold text-foreground mt-1">
                    {decodedSnowflake.increment}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm text-rose-400">
                Please enter a valid 15–21 digit numeric Discord Snowflake ID.
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
