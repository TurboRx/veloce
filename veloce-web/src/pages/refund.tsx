import Link from "next/link";
import PublicLayout from "@/components/common/PublicLayout";

export default function RefundPage() {
  return (
    <PublicLayout
      title="Refund Policy | Veloce"
      description="Refund and Return Policy for Veloce subscriptions and paid plans."
    >
      <div className="max-w-4xl mx-auto px-4 sm:py-20 py-12 sm:px-6">
        <div className="mb-10 pb-8 border-b border-border">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-4">
            Billing &amp; Subscriptions
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Refund Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last Updated: October 17, 2026
          </p>
        </div>

        <div className="space-y-8 text-sm sm:text-base text-muted-foreground leading-relaxed">
          <p>
            Thank you for choosing <strong className="text-foreground">Veloce</strong>. We want
            you to have a seamless, risk-free experience building and hosting your Discord bots.
            If you are not completely satisfied with a paid subscription, we are here to help.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              1. Definitions
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">Company</strong> (referred to as either
                &quot;the Company&quot;, &quot;We&quot;, &quot;Us&quot; or &quot;Our&quot; in this
                Agreement) refers to Veloce.
              </li>
              <li>
                <strong className="text-foreground">Service</strong> refers to the Veloce web
                application and cloud bot hosting platform accessible from{" "}
                <Link href="/" className="text-primary hover:underline font-medium">
                  veloce-app.pages.dev
                </Link>
                .
              </li>
              <li>
                <strong className="text-foreground">Subscription</strong> refers to paid recurring
                plans offered on the Service, including the{" "}
                <strong className="text-foreground">Pro ($5.99/month)</strong> and{" "}
                <strong className="text-foreground">Studio ($14.99/month)</strong> plans.
              </li>
              <li>
                <strong className="text-foreground">You</strong> means the individual accessing or
                using the Service, or the company, or other legal entity on behalf of which such
                individual is accessing or using the Service, as applicable.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              2. Your 14-Day Order Cancellation Rights
            </h2>
            <p>
              You are entitled to cancel your Subscription order within{" "}
              <strong className="text-foreground">14 days</strong> of your initial purchase
              without giving any reason for doing so.
            </p>
            <p>
              The deadline for cancelling an Order is 14 days from the date on which your
              subscription payment was processed.
            </p>
            <p>
              We will reimburse you no later than 14 days from the day on which we receive your
              refund request. We will use the same means of payment as you used for the Order,
              and you will not incur any fees for such reimbursement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              3. Subscription Cancellations After 14 Days
            </h2>
            <p>
              You may cancel your recurring Pro or Studio subscription at any time. If you cancel
              after the initial 14-day refund window, your paid plan features (including custom
              bot status branding and higher execution limits) will remain active until the end
              of your current billing period, after which your bot will automatically transition
              back to the Free Starter plan without losing your command flows.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              4. How to Request a Refund
            </h2>
            <p>
              To exercise your right of cancellation or request a refund within 14 days of
              purchase, please reach out with your Discord User ID or order receipt via our{" "}
              <a
                href="https://github.com/TurboRx/veloce/issues"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Support Tracker
              </a>{" "}
              or through your billing portal.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
