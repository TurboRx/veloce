import Head from "next/head";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
  Bot,
  Terminal,
  GitBranch,
  Sparkles,
  Check,
  Shield,
  MessageSquare,
  Users,
  Cpu,
  Globe,
  Activity,
  Database,
  Layers,
  ChevronDown,
  Play,
  Send,
} from "lucide-react";
import { getLoginUrl } from "@/lib/api";
import { useCurrentUser } from "@/lib/useAuth";
import { ThemeSwitch, DiscordLogo, GitHubLogo } from "@/components/common/ThemeSwitch";

const USE_CASES = [
  {
    title: "Moderation & Auto-Mod",
    badge: "Popular",
    description:
      "Keep your community safe with custom `/warn`, `/purge`, and automated rule enforcement flows tailored to your server.",
    icon: Shield,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    title: "Welcome & Role Onboarding",
    badge: "Essential",
    description:
      "Greet new members with personalized welcome messages, assign starter roles automatically, and guide them through your channels.",
    icon: Users,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  },
  {
    title: "Support & FAQ Automation",
    badge: "Time Saver",
    description:
      "Answer common questions instantly with ephemeral slash commands, interactive responses, and smart keyword triggers.",
    icon: MessageSquare,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    title: "Community Mini-Apps & Perks",
    badge: "Creative",
    description:
      "Build custom `/rank`, `/daily`, giveaway commands, and VIP role checks using variables and conditional logic.",
    icon: Sparkles,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
];

const FEATURES = [
  {
    title: "24/7 Cloud Hosting",
    description:
      "Your bot stays online around the clock on our global infrastructure. Never worry about servers, VPS setups, or restarts.",
    icon: Globe,
  },
  {
    title: "Visual Flow Editor",
    description:
      "Connect triggers, conditions, and actions on an intuitive node canvas that works smoothly on both desktop and mobile.",
    icon: GitBranch,
  },
  {
    title: "Custom Slash Commands",
    description:
      "Design native Discord `/commands` with arguments, descriptions, and instant autocomplete registration.",
    icon: Terminal,
  },
  {
    title: "Real-Time Event Triggers",
    description:
      "Respond automatically when members join, leave, react to messages, boost the server, or post in channels.",
    icon: Zap,
  },
  {
    title: "Smart Condition Branching",
    description:
      "Route your bot's behavior dynamically based on user roles, channel IDs, permissions, or custom expressions.",
    icon: Layers,
  },
  {
    title: "Variables & Dynamic Data",
    description:
      "Personalize every reply with `{user.username}`, `{user.id}`, and custom state variables across your flows.",
    icon: Database,
  },
  {
    title: "Live Execution Logs",
    description:
      "Inspect every command run and event trigger in real time so you can test and refine your bot with confidence.",
    icon: Activity,
  },
  {
    title: "Full Bot Ownership",
    description:
      "Use your own Discord application token, custom bot avatar, name, and status. You own your bot 100%.",
    icon: Cpu,
  },
];

const PRICING_PLANS = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "Everything you need to build and host your first custom Discord bot.",
    badge: null,
    highlighted: false,
    ctaLabel: "Get Started Free",
    features: [
      "Up to 2 Discord Bots",
      "10 Slash Commands per bot",
      "Visual Drag-and-Drop Flow Builder",
      "Free 24/7 Cloud Hosting",
      "Standard Variables & Conditions",
      "Community Support",
    ],
  },
  {
    name: "Pro",
    price: "$5.99",
    period: "per month",
    description: "For growing Discord communities and creators who want unlimited power.",
    badge: "Most Popular",
    highlighted: true,
    ctaLabel: "Upgrade to Pro",
    features: [
      "Up to 10 Custom Discord Bots",
      "Unlimited Slash Commands & Events",
      "Custom Branding (No Watermarks)",
      "Advanced Branching & Delay Flows",
      "30-Day Execution History & Logs",
      "Priority Discord Support",
    ],
  },
  {
    name: "Studio",
    price: "$14.99",
    period: "per month",
    description: "Built for multi-server networks, agencies, and power builders.",
    badge: "Unlimited",
    highlighted: false,
    ctaLabel: "Choose Studio",
    features: [
      "Unlimited Discord Bots & Servers",
      "Unlimited Commands, Events & Runs",
      "Custom Branding & White-Labeling",
      "Priority Edge Execution",
      "90-Day Audit Logs & Telemetry",
      "Dedicated Onboarding Support",
    ],
  },
];

const FAQS = [
  {
    question: "Is Veloce really free to use?",
    answer:
      "Yes! Our Starter plan is 100% free forever and includes 24/7 cloud hosting for up to 2 bots and 10 slash commands per bot. You only upgrade if you need unlimited commands or additional bots.",
  },
  {
    question: "Do I need to keep my PC or browser open for my bot to stay online?",
    answer:
      "No. Once you click Deploy, your bot runs 24/7 in the cloud. You can close your browser or turn off your device and your bot will continue responding to every command.",
  },
  {
    question: "Do I need any coding or programming experience?",
    answer:
      "Not at all. Veloce replaces code with visual building blocks. If you can connect two boxes together and type the message you want your bot to send, you can build a Discord bot in under 3 minutes.",
  },
  {
    question: "How do I connect my Discord bot?",
    answer:
      "Sign in with your Discord account, create an application in the official Discord Developer Portal, copy your Bot Token, and paste it into Veloce. We automatically fetch your bot's profile and configure your commands.",
  },
  {
    question: "Can I use Veloce on my phone or tablet?",
    answer:
      "Yes! The entire dashboard and visual Flow Builder are optimized for mobile touch screens, including pinch-to-zoom, tap-to-add blocks, and mobile property drawers.",
  },
];

export default function Home() {
  const { data: user, isLoading: authLoading } = useCurrentUser();
  const isAuthenticated = !authLoading && !!user;
  const loginHref = getLoginUrl("/apps");

  return (
    <>
      <Head>
        <title>Veloce — Build Custom Discord Bots Without Coding</title>
        <meta
          name="description"
          content="Build, customize, and host your own Discord bot in minutes with Veloce's visual no-code Flow Builder. Free 24/7 hosting included."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-background text-foreground flex flex-col justify-between overflow-x-hidden selection:bg-primary/30">
        {/* Sticky Navigation Bar */}
        <header className="border-b border-border/80 bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2.5 group">
                <div className="p-2 bg-primary/15 rounded-xl border border-primary/30 text-primary group-hover:scale-105 transition">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <span className="font-extrabold text-lg tracking-tight text-foreground">
                  VELOCE
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
                <a href="#use-cases" className="hover:text-foreground transition">
                  Use Cases
                </a>
                <a href="#how-it-works" className="hover:text-foreground transition">
                  How It Works
                </a>
                <a href="#features" className="hover:text-foreground transition">
                  Features
                </a>
                <a href="#pricing" className="hover:text-foreground transition">
                  Pricing
                </a>
                <Link
                  href="/guides/how-to-make-a-discord-bot"
                  className="hover:text-foreground transition"
                >
                  Guide
                </Link>
                <Link href="/tools" className="hover:text-foreground transition">
                  Tools
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeSwitch />

              <a
                href="https://github.com/TurboRx/veloce"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-2 h-9 px-3 text-xs font-medium rounded-lg border border-border bg-card/80 hover:bg-accent text-foreground transition"
              >
                <GitHubLogo className="w-4 h-4" />
                <span>GitHub</span>
              </a>

              {isAuthenticated ? (
                <Link
                  href="/apps"
                  className="inline-flex items-center gap-1.5 h-9 px-4 text-xs sm:text-sm font-semibold rounded-lg bg-primary hover:opacity-95 text-primary-foreground shadow-md shadow-primary/25 transition"
                >
                  Open App <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <a
                  href={loginHref}
                  className="inline-flex items-center gap-2 h-9 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-md shadow-[#5865F2]/25 transition"
                >
                  <DiscordLogo className="w-4 h-4" />
                  <span>Login with Discord</span>
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          {/* Hero Section */}
          <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28 px-4 sm:px-6 overflow-hidden">
            <div className="hero-glow w-72 h-72 sm:w-96 sm:h-96 -top-10 left-1/4 opacity-60" />
            <div className="hero-glow w-80 h-80 bottom-0 right-10 opacity-50" />

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center relative z-10">
              {/* Left Column: Copy & CTAs */}
              <div className="lg:col-span-7 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold mb-6">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Free 24/7 Cloud Hosting Included
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.12] text-foreground">
                  Build Custom{" "}
                  <span className="bg-gradient-to-r from-[#5865F2] via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                    Discord Bots
                  </span>{" "}
                  Without Coding.
                </h1>

                <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                  Create slash commands, welcome messages, role automation, and interactive
                  moderation flows in minutes. Drag and drop blocks visually—we host your bot
                  24/7 for free.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3.5 max-w-md sm:max-w-none mx-auto lg:mx-0">
                  {isAuthenticated ? (
                    <Link
                      href="/apps"
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:opacity-95 text-primary-foreground font-semibold text-sm sm:text-base shadow-lg shadow-primary/25 transition"
                    >
                      Go to Your Bots <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <a
                      href={loginHref}
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-sm sm:text-base shadow-lg shadow-[#5865F2]/30 transition hover:-translate-y-0.5"
                    >
                      <DiscordLogo className="w-5 h-5" />
                      <span>Login with Discord</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  )}

                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-card hover:bg-accent text-foreground font-semibold text-sm sm:text-base border border-border transition shadow-sm"
                  >
                    See How It Works
                  </a>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Free forever starter plan
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> No credit card required
                  </span>
                  <a
                    href="https://github.com/TurboRx/veloce"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition underline underline-offset-4"
                  >
                    <GitHubLogo className="w-3.5 h-3.5" /> Open source on GitHub
                  </a>
                </div>
              </div>

              {/* Right Column: Interactive Visual Flow + Discord Preview Mockup */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-border bg-card/90 p-4 sm:p-5 shadow-2xl relative">
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                      <span className="text-xs font-mono text-muted-foreground ml-1">
                        /vip-reward — Flow Builder
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Play className="w-2.5 h-2.5 fill-current" /> Live
                    </span>
                  </div>

                  {/* Visual Node Graph Preview */}
                  <div className="space-y-3">
                    {/* Node 1: Slash Command Trigger */}
                    <div className="rounded-xl border-2 border-emerald-500/40 bg-background/90 p-3 shadow-sm">
                      <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5" /> SLASH COMMAND
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[10px] font-mono">
                          Trigger
                        </span>
                      </div>
                      <div className="font-mono text-xs font-bold text-foreground">/claim</div>
                      <div className="text-[11px] text-muted-foreground">
                        Claim your daily community reward
                      </div>
                    </div>

                    {/* Connector */}
                    <div className="flex justify-center -my-1">
                      <div className="w-0.5 h-4 bg-primary/50" />
                    </div>

                    {/* Node 2: Reply Action */}
                    <div className="rounded-xl border-2 border-cyan-500/40 bg-background/90 p-3 shadow-sm">
                      <div className="flex items-center justify-between text-[11px] font-bold text-cyan-400 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5" /> SEND REPLY
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-[10px]">
                          Ephemeral
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-foreground bg-card p-2 rounded border border-border">
                        🎉 Congrats <span className="text-primary">{"{user.username}"}</span>! You
                        claimed +250 XP.
                      </div>
                    </div>
                  </div>

                  {/* Simulated Live Discord Output */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Instant Discord Output
                    </div>
                    <div className="rounded-xl bg-[#313338] text-[#f2f3f5] p-3 border border-black/20 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">CommunityBot</span>
                          <span className="px-1 py-0.2 rounded bg-[#5865F2] text-[9px] font-bold text-white uppercase">
                            APP
                          </span>
                          <span className="text-[10px] text-[#949ba4]">Today at 12:00 PM</span>
                        </div>
                        <p className="text-xs text-[#dbdee1] mt-1">
                          🎉 Congrats <span className="text-[#00a8fc] font-medium">@Alex</span>! You
                          claimed <strong>+250 XP</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Social Proof / Metrics Bar */}
          <section className="border-y border-border bg-card/40 py-10 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-center">
              <div>
                <div className="text-2xl sm:text-4xl font-extrabold text-primary">24/7</div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                  Always-On Cloud Hosting
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-4xl font-extrabold text-primary">&lt; 50ms</div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                  Command Response Time
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-4xl font-extrabold text-primary">100%</div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                  Visual No-Code Workflow
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-4xl font-extrabold text-primary">$0</div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                  To Build &amp; Launch Your Bot
                </div>
              </div>
            </div>
          </section>

          {/* Use Cases Section */}
          <section id="use-cases" className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Endless Possibilities
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
                  What Will You Build?
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mt-3">
                  From welcoming new members to running custom server commands, build exactly what
                  your community needs without relying on bloated public bots.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                {USE_CASES.map((uc) => {
                  const Icon = uc.icon;
                  return (
                    <div
                      key={uc.title}
                      className="rounded-2xl bg-card border border-border p-6 hover:border-primary/40 transition shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div className={`p-3 rounded-xl border ${uc.color}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            {uc.badge}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-foreground mb-2">{uc.title}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                          {uc.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* How It Works Section */}
          <section
            id="how-it-works"
            className="py-16 sm:py-24 px-4 sm:px-6 border-y border-border bg-card/30"
          >
            <div className="max-w-7xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  3 Simple Steps
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
                  From Idea to Live Bot in 3 Minutes
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mt-3">
                  No servers to configure, no packages to install, and no code to debug.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                <div className="rounded-2xl bg-card border border-border p-6 relative shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center mb-4 shadow">
                    1
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
                    Login with Discord
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Sign in with your Discord account and connect your bot token from the Discord
                    Developer Portal. We automatically pull your bot&apos;s name and avatar.
                  </p>
                </div>

                <div className="rounded-2xl bg-card border border-border p-6 relative shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center mb-4 shadow">
                    2
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
                    Build Your Visual Flow
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Pick a slash command or server event trigger, then drag and drop reply messages,
                    condition checks, delays, and variables on the visual canvas.
                  </p>
                </div>

                <div className="rounded-2xl bg-card border border-border p-6 relative shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center mb-4 shadow">
                    3
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
                    Click Deploy &amp; Go Live
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Hit Deploy to sync your slash commands directly with Discord. Your bot is
                    immediately live 24/7 in all of your servers.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Features Grid Section */}
          <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Platform Capabilities
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
                  Everything Your Discord Bot Needs
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mt-3">
                  Powerful enough for experienced community managers, simple enough for first-time
                  creators.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {FEATURES.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <div
                      key={feat.title}
                      className="rounded-2xl bg-card border border-border p-5 hover:border-primary/40 transition shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-4">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-base font-bold text-foreground mb-1.5">{feat.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {feat.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section
            id="pricing"
            className="py-16 sm:py-24 px-4 sm:px-6 border-y border-border bg-card/30"
          >
            <div className="max-w-7xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Simple Pricing
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
                  Start Free, Upgrade as Your Server Grows
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mt-3">
                  Every bot starts on the free plan. Upgrade a single bot when it needs higher
                  limits, and cancel any time.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch">
                {PRICING_PLANS.map((plan) => (
                  <div
                    key={plan.name}
                    className={`rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative transition ${
                      plan.highlighted
                        ? "bg-card border-2 border-primary shadow-xl shadow-primary/10"
                        : "bg-card border border-border shadow-sm"
                    }`}
                  >
                    {plan.badge && (
                      <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full text-[11px] font-bold bg-primary text-primary-foreground shadow">
                        {plan.badge}
                      </div>
                    )}

                    <div>
                      <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1.5 min-h-[32px]">
                        {plan.description}
                      </p>

                      <div className="mt-5 mb-6 flex items-baseline gap-1.5">
                        <span className="text-3xl sm:text-4xl font-extrabold text-foreground">
                          {plan.price}
                        </span>
                        <span className="text-xs text-muted-foreground">/ {plan.period}</span>
                      </div>

                      <ul className="space-y-3 border-t border-border pt-6 mb-8">
                        {plan.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-2.5 text-xs sm:text-sm text-foreground"
                          >
                            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <a
                      href={isAuthenticated ? "/apps" : loginHref}
                      className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-center transition inline-flex items-center justify-center gap-2 ${
                        plan.highlighted
                          ? "bg-primary hover:opacity-95 text-primary-foreground shadow-md shadow-primary/25"
                          : "bg-secondary hover:bg-accent text-secondary-foreground"
                      }`}
                    >
                      {plan.ctaLabel} <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Got Questions?
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
                  Frequently Asked Questions
                </h2>
              </div>

              <div className="space-y-3.5">
                {FAQS.map((faq) => (
                  <details
                    key={faq.question}
                    className="group rounded-2xl bg-card border border-border px-5 py-4 transition hover:border-primary/40"
                  >
                    <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-sm sm:text-base text-foreground">
                      <span>{faq.question}</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
                    </summary>
                    <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed pt-3 border-t border-border/60">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom High-Conversion CTA Banner */}
          <section className="py-12 sm:py-20 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto rounded-3xl bg-card border border-border p-8 sm:p-14 text-center relative overflow-hidden shadow-2xl">
              <div className="hero-glow w-72 h-72 -top-20 left-1/2 -translate-x-1/2 opacity-40" />
              <div className="relative z-10">
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground max-w-xl mx-auto">
                  Ready to Build Your Custom Discord Bot?
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto mt-3 mb-8">
                  Join creators and community owners building custom Discord bots visually—hosted
                  24/7 for free.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
                  {isAuthenticated ? (
                    <Link
                      href="/apps"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-primary hover:opacity-95 text-primary-foreground font-semibold text-sm sm:text-base shadow-lg shadow-primary/25 transition"
                    >
                      Open Your Dashboard <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <a
                      href={loginHref}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-sm sm:text-base shadow-lg shadow-[#5865F2]/30 transition"
                    >
                      <DiscordLogo className="w-5 h-5" />
                      <span>Login with Discord — It&apos;s Free</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Multi-Column Footer */}
        <footer className="border-t border-border bg-card/40 py-12 px-4 sm:px-6 text-xs text-muted-foreground">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 mb-8">
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 text-foreground font-bold text-base mb-3">
                <div className="p-1.5 bg-primary/15 rounded-lg border border-primary/30 text-primary">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <span>VELOCE</span>
              </div>
              <p className="text-muted-foreground max-w-sm leading-relaxed">
                The visual no-code Discord bot builder and 24/7 cloud hosting platform for modern
                communities.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 uppercase tracking-wider text-[11px]">
                Platform
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <a href="#use-cases" className="hover:text-foreground transition">
                    Use Cases
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-foreground transition">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-foreground transition">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-foreground transition">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 uppercase tracking-wider text-[11px]">
                Resources
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/docs" className="hover:text-foreground transition">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides/how-to-make-a-discord-bot"
                    className="hover:text-foreground transition"
                  >
                    Bot Building Guide
                  </Link>
                </li>
                <li>
                  <Link href="/tools" className="hover:text-foreground transition">
                    Discord Tools
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-3 uppercase tracking-wider text-[11px]">
                Legal
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/terms" className="hover:text-foreground transition">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground transition">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/refund" className="hover:text-foreground transition">
                    Refund Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="max-w-7xl mx-auto pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} Veloce. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/TurboRx/veloce"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition"
              >
                <GitHubLogo className="w-4 h-4" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
