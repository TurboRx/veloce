import Link from "next/link";
import PublicLayout from "@/components/common/PublicLayout";

export default function TermsPage() {
  return (
    <PublicLayout
      title="Terms of Service | Veloce"
      description="Terms of Service for Veloce, the visual no-code Discord bot builder and 24/7 cloud hosting platform."
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="mb-10 pb-8 border-b border-border">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-4">
            Legal Agreement
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last Updated: October 17, 2026
          </p>
        </div>

        <div className="space-y-8 text-sm sm:text-base text-muted-foreground leading-relaxed">
          <p>
            Welcome to <strong className="text-foreground">Veloce</strong> (&quot;Company&quot;,
            &quot;we&quot;, &quot;our&quot;, &quot;us&quot;)! These Terms of Service
            (&quot;Terms&quot;) govern your use of our website and cloud-hosted Discord bot
            builder platform located at{" "}
            <Link href="/" className="text-primary hover:underline font-medium">
              veloce-app.pages.dev
            </Link>{" "}
            (together or individually &quot;Service&quot;) operated by Veloce.
          </p>

          <p>
            Our{" "}
            <Link href="/privacy" className="text-primary hover:underline font-medium">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/refund" className="text-primary hover:underline font-medium">
              Refund Policy
            </Link>{" "}
            also govern your use of our Service and explain how we collect, safeguard, and
            disclose information that results from your use of our web pages. By accessing or
            using the Service, you agree to be bound by these Terms.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              1. Accounts &amp; Discord Authentication
            </h2>
            <p>
              When you authenticate with our Service using Discord OAuth2, you guarantee that you
              are above the minimum age required by Discord&apos;s Terms of Service in your
              jurisdiction (at least 13 years of age) and that the information associated with
              your account is accurate and current at all times.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your Discord bot tokens
              and application credentials connected to Veloce. You must notify us immediately
              upon becoming aware of any breach of security or unauthorized use of your account
              or bot tokens.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              2. Acceptable Use &amp; Discord Compliance
            </h2>
            <p>
              All Discord bots built, configured, or hosted through Veloce must strictly comply
              with{" "}
              <a
                href="https://discord.com/terms"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Discord&apos;s Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Discord&apos;s Developer Terms of Service
              </a>
              . You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Send unsolicited mass direct messages (DM spam), raid servers, or abuse Discord API
                rate limits.
              </li>
              <li>
                Distribute malware, phishing links, fraudulent content, or illegal material.
              </li>
              <li>
                Harass, abuse, or collect unauthorized personal data from Discord users.
              </li>
              <li>
                Attempt to bypass platform execution limits, quotas, or security sandboxes.
              </li>
            </ul>
            <p>
              We reserve the right to immediately suspend or terminate any bot or account found
              violating these rules.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              3. Subscriptions, Plans &amp; Custom Branding
            </h2>
            <p>
              Some parts of the Service are billed on a subscription basis (&quot;Subscription(s)&quot;),
              such as the <strong className="text-foreground">Pro ($5.99/month)</strong> and{" "}
              <strong className="text-foreground">Studio ($14.99/month)</strong> plans. You will
              be billed in advance on a recurring and periodic basis (&quot;Billing Cycle&quot;).
            </p>
            <p>
              Bots hosted on the Free Starter plan include default Veloce branding. Upgrading to
              a paid Pro or Studio plan unlocks custom bot status branding, white-label command
              responses, and higher execution limits.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              4. Fair Use &amp; Anti-Abuse Quota
            </h2>
            <p>
              To ensure high availability, edge performance, and compliance with Discord&apos;s
              Gateway and REST API rate limits for all customers, &quot;Unlimited&quot; subscription
              tiers (including the <strong className="text-foreground">Studio</strong> plan) are
              subject to a <strong className="text-foreground">30-bot Fair Use baseline</strong>{" "}
              per account (expandable at any time via self-serve{" "}
              <strong className="text-foreground">+10 Extra Bot Slots</strong> capacity add-ons)
              alongside standard Cloudflare Edge execution quotas to prevent platform abuse, token
              farming, and Discord API rate-limit violations.
            </p>
            <p>
              Users whose legitimate operations exceed the 30-bot Fair Use baseline may purchase
              additional capacity add-on packs (
              <code className="font-mono text-xs bg-card px-1.5 py-0.5 rounded border border-border text-foreground">
                extra_bot_slots
              </code>
              ) directly from their dashboard. Veloce reserves the sole right to throttle, restrict,
              permanently suspend accounts, or revoke and purge bot tokens involved in server raids,
              mass bot-token automation, spam, or Discord API abuse without prior notice or refund.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              5. Refunds
            </h2>
            <p>
              We offer a 14-day refund window on initial subscription purchases in accordance
              with our{" "}
              <Link href="/refund" className="text-primary hover:underline font-medium">
                Refund Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              6. User Content &amp; Bot Configurations
            </h2>
            <p>
              You retain full ownership of the custom command flows, embeds, messages, and event
              logic you create on Veloce (&quot;Content&quot;). By saving and deploying Content
              on the Service, you grant us the technical right to store, process, and transmit
              that Content to Discord&apos;s APIs solely for the purpose of operating your bots.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              7. Intellectual Property
            </h2>
            <p>
              The Service and its original visual flow builder, runtime engine, features, and
              functionality are and will remain the exclusive property of Veloce and its
              licensors.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              8. Disclaimer of Warranty &amp; Limitation of Liability
            </h2>
            <p>
              These Services are provided by Veloce on an &quot;as is&quot; and &quot;as
              available&quot; basis. While we strive for 99.9% uptime across our edge worker
              network, we make no warranties regarding uninterrupted availability of third-party
              services, including Discord&apos;s Gateway or REST APIs.
            </p>
            <p>
              Except as prohibited by law, you will hold us and our officers, directors,
              employees, and agents harmless for any indirect, punitive, special, incidental, or
              consequential damage, however it arises. If there is liability found on the part of
              Veloce, it will be limited to the amount paid for the Services in the preceding 12
              months.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              9. Termination
            </h2>
            <p>
              You may delete your bots or discontinue using the Service at any time directly from
              your dashboard. When a bot is deleted from Veloce, its active Gateway session is
              immediately terminated, its slash commands are cleared, and its stored token is
              permanently removed from our database.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              10. Changes to Terms
            </h2>
            <p>
              We may amend these Terms at any time by posting the amended terms on this page.
              Your continued use of the Platform following the posting of revised Terms means
              that you accept and agree to the changes.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
