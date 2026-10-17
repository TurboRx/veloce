import Link from "next/link";
import PublicLayout from "@/components/common/PublicLayout";
import { getLoginUrl } from "@/lib/api";
import {
  Sparkles,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  KeyRound,
  Blocks,
  Rocket,
  HelpCircle,
} from "lucide-react";

const GUIDE_STEPS = [
  {
    number: "01",
    title: "Create a Discord Application",
    subtitle: "Set up your bot identity in the official Discord Developer Portal",
    icon: KeyRound,
    points: [
      'Open the Discord Developer Portal (discord.com/developers/applications) and click "New Application" in the top-right corner.',
      "Give your bot a memorable name (you can customize its avatar and bio too) and accept the Developer Terms of Service.",
      'Navigate to the "Bot" tab in the left sidebar and click "Reset Token" to generate your secret Bot Token.',
      "Copy your Bot Token to a safe place. If your bot will respond to regular chat messages or member join events, scroll down and enable Message Content Intent and Server Members Intent.",
    ],
  },
  {
    number: "02",
    title: "Connect Your Bot to Veloce",
    subtitle: "Link your token in seconds—no servers or coding required",
    icon: Sparkles,
    points: [
      'Click "Login with Discord" on Veloce to open your Bot Dashboard.',
      'Paste your Discord Bot Token into the "Connect New Bot" box and click Create.',
      "Veloce immediately validates your token against Discord's API, fetches your bot's profile, and creates a starter /ping command automatically.",
      "Our 24/7 cloud runtime brings your bot online in Discord within seconds.",
    ],
  },
  {
    number: "03",
    title: "Build Your First Command Visually",
    subtitle: "Drag and drop triggers, embeds, conditions, and role actions",
    icon: Blocks,
    points: [
      'Click "Open Visual Builder" on your bot card in the dashboard.',
      "Select the starter /ping command or click + New Command to create a custom slash command like /welcome or /faq.",
      "Drag a Send Message, Embed, Role Action, or Condition block onto the canvas and connect the nodes.",
      "Use dynamic variables like {{user.mention}} or {{guild.id}} to personalize every response, then click Save & Deploy.",
    ],
  },
  {
    number: "04",
    title: "Invite & Test It in Discord",
    subtitle: "Add your bot to your server and run your slash command",
    icon: Rocket,
    points: [
      'Click the "Invite Bot" button in your Veloce dashboard or visual builder.',
      'Choose "Add to Server" (to invite the bot to a community server) or "Add to Account" (to use the bot across all DMs and servers).',
      "Open your Discord server, type /ping (or your custom command name) in any text channel, and watch your bot respond live!",
    ],
  },
];

const GUIDE_FAQS = [
  {
    q: "Is Veloce really free to use?",
    a: "Yes! Our Starter plan is 100% free forever and includes 24/7 cloud hosting, the visual flow builder, slash commands, and event listeners. You can upgrade to Pro ($5.99/mo) or Studio ($14.99/mo) anytime if you want custom bot status branding and higher limits.",
  },
  {
    q: "Do I need to keep my computer or browser tab open?",
    a: "No. Once your bot is enabled on Veloce, it runs 24/7 on our cloud infrastructure even when your computer is turned off.",
  },
  {
    q: "Do I need to know JavaScript, Python, or Discord.js?",
    a: "No coding knowledge is needed at all. Every slash command, embed, condition, and moderation action is built visually using drag-and-drop blocks.",
  },
  {
    q: "How do I take my bot offline or delete it?",
    a: "You can toggle your bot offline or delete it with one click from your Veloce dashboard. Deleting a bot immediately closes its Discord Gateway connection and removes its commands.",
  },
];

export default function HowToMakeADiscordBotPage() {
  const loginHref = getLoginUrl("/apps");

  return (
    <PublicLayout
      title="How to Make a Discord Bot Without Coding (2026 Guide) | Veloce"
      description="Learn how to create, customize, and host your own Discord bot for free in under 5 minutes without writing a single line of code."
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {/* Hero Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Beginner-Friendly Tutorial · Under 5 Minutes</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            How to Make a Custom Discord Bot Without Coding
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Want to build a custom Discord bot with your own name, avatar, slash commands, and
            welcome messages—without managing servers or writing code? Follow these 4 simple
            steps.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={loginHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:opacity-95 text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 transition"
            >
              <span>Start Building Free</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-card hover:bg-accent text-foreground border border-border text-sm font-semibold transition"
            >
              <span>Open Discord Developer Portal</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          </div>
        </div>

        {/* 4 Step Cards */}
        <div className="space-y-8 mb-20">
          {GUIDE_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="rounded-3xl bg-card border border-border p-6 sm:p-8 shadow-sm hover:border-primary/40 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-border">
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center font-extrabold text-lg shrink-0">
                      {step.number}
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                        {step.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {step.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:flex p-3 rounded-2xl bg-secondary/70 border border-border text-primary">
                    <Icon className="w-6 h-6" />
                  </div>
                </div>

                <ul className="space-y-3.5">
                  {step.points.map((pt, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm sm:text-base text-muted-foreground leading-relaxed"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Guide FAQ */}
        <div className="mb-16">
          <div className="flex items-center gap-2.5 mb-6">
            <HelpCircle className="w-6 h-6 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GUIDE_FAQS.map((faq) => (
              <div
                key={faq.q}
                className="rounded-2xl bg-card border border-border p-5 space-y-2"
              >
                <h3 className="font-bold text-sm sm:text-base text-foreground">
                  {faq.q}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="rounded-3xl bg-card border border-border p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Ready to Launch Your Discord Bot?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto mt-2 mb-6">
            Connect your Discord bot token and deploy your first custom slash command in under 60
            seconds.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={loginHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:opacity-95 text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 transition"
            >
              <span>Create Your Bot Now</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/tools"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-secondary hover:bg-accent text-foreground text-sm font-semibold transition"
            >
              <span>Explore Discord Tools</span>
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
