import Link from "next/link";
import { useState } from "react";
import PublicLayout from "@/components/common/PublicLayout";
import {
  BookOpen,
  Terminal,
  Zap,
  GitBranch,
  Database,
  Shield,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";

const DOC_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Zap,
  },
  {
    id: "slash-commands",
    title: "Slash Commands",
    icon: Terminal,
  },
  {
    id: "event-listeners",
    title: "Event Listeners",
    icon: Sparkles,
  },
  {
    id: "variables-templates",
    title: "Variables & Placeholders",
    icon: Database,
  },
  {
    id: "conditions-branching",
    title: "Conditions & Logic",
    icon: GitBranch,
  },
  {
    id: "permissions-hosting",
    title: "Permissions & 24/7 Hosting",
    icon: Shield,
  },
];

const PLACEHOLDERS = [
  { token: "{{user.id}}", desc: "The Discord Snowflake ID of the user who triggered the command or event." },
  { token: "{{user.username}}", desc: "The username of the triggering Discord user." },
  { token: "{{user.mention}}", desc: "Mentions the triggering user (<@id>)." },
  { token: "{{guild.id}}", desc: "The Discord Server (Guild) ID where the interaction occurred." },
  { token: "{{channel.id}}", desc: "The Discord Channel ID where the command was executed." },
  { token: "{{option.query}}", desc: "Reads the value of a command option named 'query'." },
  { token: "{{var.counter}}", desc: "Reads a stored value from persistent variable storage." },
];

export default function DocsPage() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  return (
    <PublicLayout
      title="Documentation | Veloce Discord Bot Builder"
      description="Complete documentation for building, customizing, and hosting Discord bots on Veloce."
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="mb-12 pb-8 border-b border-border flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-4">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Platform Reference</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
              Veloce Documentation
            </h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
              Learn how to design visual node flows, use dynamic template variables, configure
              event listeners, and deploy your Discord bot to our 24/7 edge runtime.
            </p>
          </div>

          <Link
            href="/guides/how-to-make-a-discord-bot"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-accent text-foreground border border-border text-xs sm:text-sm font-semibold transition shrink-0"
          >
            <span>Step-by-Step Bot Guide</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-3">
            <div className="sticky top-24 rounded-2xl bg-card border border-border p-4 space-y-1">
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                On This Page
              </div>
              {DOC_SECTIONS.map((sec) => {
                const Icon = sec.icon;
                return (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition"
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span>{sec.title}</span>
                  </a>
                );
              })}
            </div>
          </aside>

          {/* Main Documentation Body */}
          <div className="lg:col-span-9 space-y-14">
            {/* 1. Getting Started */}
            <section id="getting-started" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-primary" />
                <span>1. Getting Started</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Veloce connects directly to your Discord Application via your Bot Token and runs
                your bot 24/7 on our serverless edge worker network. Every bot you create on
                Veloce automatically comes with a starter <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground">/ping</code> command so you can test it in Discord right away.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1">
                    Step 1
                  </div>
                  <div className="font-semibold text-sm text-foreground mb-1">
                    Create Bot in Discord
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Create an application in the Discord Developer Portal and copy your Bot Token.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1">
                    Step 2
                  </div>
                  <div className="font-semibold text-sm text-foreground mb-1">
                    Connect to Veloce
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste your token in the Veloce Dashboard. We validate it and register your
                    slash commands automatically.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1">
                    Step 3
                  </div>
                  <div className="font-semibold text-sm text-foreground mb-1">
                    Build &amp; Invite
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click &quot;Invite Bot&quot; to add your bot to your Discord server and design
                    flows visually.
                  </p>
                </div>
              </div>
            </section>

            {/* 2. Slash Commands */}
            <section id="slash-commands" className="scroll-mt-24 space-y-4 pt-8 border-t border-border">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-primary" />
                <span>2. Slash Commands</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Slash commands (<code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground">/help</code>,{" "}
                <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground">/userinfo</code>,{" "}
                <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground">/warn</code>) are the primary way users interact with your bot in Discord.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">Entry Trigger Node:</strong> Every command
                  flow starts with a Command Trigger node where you define the command name (lowercase, no spaces) and description.
                </li>
                <li>
                  <strong className="text-foreground">Response Nodes:</strong> Connect a{" "}
                  <em>Send Message / Reply</em> node to respond with text, Markdown, or rich embeds. You can toggle <strong className="text-foreground">Ephemeral</strong> so only the user who ran the command sees the response.
                </li>
                <li>
                  <strong className="text-foreground">Instant Discord Sync:</strong> Whenever you
                  save a command in the Visual Builder, Veloce automatically synchronizes your
                  global slash commands with Discord&apos;s REST API.
                </li>
              </ul>
            </section>

            {/* 3. Event Listeners */}
            <section id="event-listeners" className="scroll-mt-24 space-y-4 pt-8 border-t border-border">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-primary" />
                <span>3. Event Listeners</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Event listeners allow your bot to react automatically to activity in your server
                without waiting for a slash command:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <div className="font-mono text-xs text-primary font-semibold mb-1">
                    MESSAGE_CREATE
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1">
                    New Channel Message
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fires whenever a user sends a message. Ideal for auto-responders, keyword
                    triggers, and leveling systems.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <div className="font-mono text-xs text-primary font-semibold mb-1">
                    GUILD_MEMBER_ADD
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1">
                    Member Joined Server
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fires when a new member joins your Discord server. Perfect for welcome
                    messages and automatic starter roles.
                  </p>
                </div>
              </div>
            </section>

            {/* 4. Variables & Placeholders */}
            <section id="variables-templates" className="scroll-mt-24 space-y-4 pt-8 border-t border-border">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <Database className="w-5 h-5 text-primary" />
                <span>4. Variables &amp; Placeholders</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Use double-curly-brace syntax inside any message, embed, or condition block to
                inject live Discord data or persistent variable values. Click any placeholder
                below to copy it:
              </p>

              <div className="rounded-2xl border border-border overflow-hidden bg-card">
                {PLACEHOLDERS.map((item, idx) => (
                  <div
                    key={item.token}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 ${
                      idx !== PLACEHOLDERS.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => copyToken(item.token)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary hover:bg-accent font-mono text-xs font-semibold text-primary border border-border transition"
                        title="Click to copy"
                      >
                        <span>{item.token}</span>
                        {copiedToken === item.token ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. Conditions & Logic */}
            <section id="conditions-branching" className="scroll-mt-24 space-y-4 pt-8 border-t border-border">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <GitBranch className="w-5 h-5 text-primary" />
                <span>5. Conditions &amp; Branching Logic</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Add <strong className="text-foreground">Condition (If / Else)</strong> blocks to
                compare variables, user IDs, or command options. Connect actions to the{" "}
                <span className="text-emerald-400 font-semibold">True</span> handle or{" "}
                <span className="text-rose-400 font-semibold">False</span> handle to build
                multi-step decision trees visually.
              </p>
            </section>

            {/* 6. Permissions & 24/7 Hosting */}
            <section id="permissions-hosting" className="scroll-mt-24 space-y-4 pt-8 border-t border-border">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-primary" />
                <span>6. Permissions &amp; 24/7 Hosting</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Veloce maintains a persistent Discord Gateway WebSocket connection for every
                enabled bot. If you disable or delete a bot from your dashboard, Veloce
                immediately sends an offline presence update, closes the Gateway session, and
                clears its global slash commands.
              </p>
              <div className="pt-2">
                <Link
                  href="/tools"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                >
                  <span>Use the Discord Permissions Calculator in our Tools suite</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
