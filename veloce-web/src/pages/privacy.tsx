import Link from "next/link";
import PublicLayout from "@/components/common/PublicLayout";

export default function PrivacyPage() {
  return (
    <PublicLayout
      title="Privacy Policy | Veloce"
      description="Privacy Policy for Veloce, explaining how we collect, safeguard, and process your data."
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="mb-10 pb-8 border-b border-border">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-4">
            Data Protection
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last Updated: October 17, 2026
          </p>
        </div>

        <div className="space-y-8 text-sm sm:text-base text-muted-foreground leading-relaxed">
          <p>
            Welcome to <strong className="text-foreground">Veloce</strong> (&quot;us&quot;,
            &quot;we&quot;, or &quot;our&quot;). We operate{" "}
            <Link href="/" className="text-primary hover:underline font-medium">
              veloce-app.pages.dev
            </Link>{" "}
            (hereinafter referred to as &quot;Service&quot;). Our Privacy Policy governs your
            visit to our platform and explains how we collect, safeguard, and disclose
            information that results from your use of our Service.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              1. Information We Collect
            </h2>
            <p>
              We collect only the minimum information required to authenticate your account and
              operate your custom Discord bots:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">Discord Account Profile Data:</strong> When
                you sign in via Discord OAuth2, we receive your Discord User ID, username,
                display name, avatar hash, and email address (if authorized).
              </li>
              <li>
                <strong className="text-foreground">Bot Configuration &amp; Credentials:</strong>{" "}
                When you connect a Discord bot to Veloce, we store your bot&apos;s Discord
                Application ID, Bot Token, visual command flow definitions, event listeners,
                custom status settings, and persistent variable values.
              </li>
              <li>
                <strong className="text-foreground">Usage &amp; Execution Logs:</strong> We store
                recent bot execution logs and error diagnostics so you can inspect and debug your
                bot&apos;s behavior in the dashboard.
              </li>
              <li>
                <strong className="text-foreground">Cookies &amp; Session Data:</strong> We use
                secure HTTP/HTTPS session cookies (<code className="text-xs bg-secondary px-1.5 py-0.5 rounded">veloce_session</code>) and
                local storage to keep you signed in and remember your interface theme preference
                (Light, Dark, or System).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              2. How We Use Your Data
            </h2>
            <p>Veloce uses the collected data for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide, maintain, and host your Discord bots 24/7 on our cloud runtime;</li>
              <li>To synchronize your visual slash commands and event flows with Discord&apos;s API;</li>
              <li>To authenticate your sessions and secure your dashboard access;</li>
              <li>To provide real-time telemetry, execution logs, and customer support;</li>
              <li>To detect, prevent, and address technical issues or Terms of Service violations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              3. Retention &amp; Immediate Deletion of Bot Data
            </h2>
            <p>
              We retain your Personal Data and bot configurations only for as long as your
              account or bot remains active on Veloce.
            </p>
            <p>
              When you delete a bot from your Veloce dashboard, we immediately disconnect its
              Discord Gateway session, unregister its global commands on Discord, and permanently
              delete its Bot Token, commands, event listeners, and execution logs from our
              database.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              4. Security of Data
            </h2>
            <p>
              The security of your data—especially your Discord Bot Tokens—is our highest
              priority. All communication between your browser, our edge worker runtime, our
              PostgreSQL database, and Discord&apos;s APIs is encrypted in transit via TLS/HTTPS.
              Bot tokens are never exposed in public responses after initial creation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              5. Your Data Protection Rights (GDPR &amp; CCPA)
            </h2>
            <p>
              Depending on your location, you have the right to access, update, export, or delete
              the personal information we have on you. You can export your bot flows as JSON or
              permanently delete your bots at any time directly within the Veloce dashboard.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              6. Service Providers
            </h2>
            <p>
              We rely on trusted infrastructure providers to deliver our Service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">Cloudflare:</strong> Edge computing, Workers
                runtime, and Pages hosting.
              </li>
              <li>
                <strong className="text-foreground">Neon Serverless Postgres:</strong> Encrypted
                cloud database storage for bot flows and account metadata.
              </li>
              <li>
                <strong className="text-foreground">Discord API:</strong> OAuth2 authentication
                and bot Gateway/REST execution.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              7. Changes to This Privacy Policy
            </h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any
              changes by posting the new Privacy Policy on this page and updating the
              &quot;Last Updated&quot; date at the top.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
