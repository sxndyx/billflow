import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import { Check, Circle, X, ArrowRight } from "lucide-react";

// Shown on the dashboard after setup until the user has been all the way
// through the loop once, or dismisses it.
export function GettingStarted() {
  const { status, showChecklist, dismissTour } = useOnboarding();

  if (!showChecklist || !status) return null;

  const steps = [
    {
      done: status.checklist.hasClient,
      title: "Add a client",
      body: "Someone you bill. Invoices are raised per client.",
      href: "/clients",
      cta: "Go to Clients",
    },
    {
      done: status.checklist.hasSession,
      title: "Log some hours",
      body: "Open the timesheet and add a session. Pick the date, the times and which rate applies.",
      href: "/timesheet",
      cta: "Go to Timesheet",
    },
    {
      done: status.checklist.hasInvoice,
      title: "Create your first invoice",
      body: "Pick a client and a date range. Every unbilled session in that range becomes a line item.",
      href: "/invoices",
      cta: "Go to Invoices",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const next = steps.find((s) => !s.done);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 mb-8">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display font-bold text-lg">
            {allDone ? "You are all set" : "Getting started"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {allDone
              ? "You have been through the whole loop. Close this whenever you like."
              : `${doneCount} of ${steps.length} done. Work through these and you will have sent your first invoice.`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismissTour()}
          aria-label="Dismiss getting started"
          className="text-muted-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ol className="space-y-3">
        {steps.map((step) => {
          const isNext = step === next;
          return (
            <li
              key={step.title}
              className={
                "flex items-start gap-3 rounded-xl px-4 py-3 border " +
                (step.done
                  ? "border-transparent bg-secondary/40"
                  : isNext
                    ? "border-primary/30 bg-primary/5"
                    : "border-transparent")
              }
            >
              {step.done ? (
                <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={"font-medium " + (step.done ? "text-muted-foreground line-through" : "")}>
                  {step.title}
                </p>
                {!step.done && <p className="text-sm text-muted-foreground mt-0.5">{step.body}</p>}
              </div>
              {isNext && (
                <Link href={step.href}>
                  <Button size="sm" className="rounded-lg shrink-0">
                    {step.cta}
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {allDone && (
        <Button variant="outline" className="w-full mt-5 rounded-xl" onClick={() => dismissTour()}>
          Close
        </Button>
      )}
    </div>
  );
}
