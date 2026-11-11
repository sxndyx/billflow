import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboarding, type SetupPayload } from "@/hooks/use-onboarding";
import {
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  Building2,
  Landmark,
  Clock,
  FileText,
  Users,
} from "lucide-react";

type StepId = "welcome" | "business" | "payment" | "rates" | "invoicing" | "client";

const STEPS: { id: StepId; title: string; icon: typeof Building2 }[] = [
  { id: "business", title: "Your business", icon: Building2 },
  { id: "payment", title: "Getting paid", icon: Landmark },
  { id: "rates", title: "Your rates", icon: Clock },
  { id: "invoicing", title: "Invoice numbers", icon: FileText },
  { id: "client", title: "First client", icon: Users },
];

interface FormState {
  businessName: string;
  businessEmail: string;
  businessAddress: string;
  abn: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  paymentMethod: string;
  defaultJuniorRate: string;
  defaultSeniorRate: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  clientPhone: string;
}

const EMPTY: FormState = {
  businessName: "",
  businessEmail: "",
  businessAddress: "",
  abn: "",
  accountName: "",
  bsb: "",
  accountNumber: "",
  paymentMethod: "Bank Transfer",
  defaultJuniorRate: "",
  defaultSeniorRate: "",
  invoicePrefix: "INV-",
  nextInvoiceNumber: "1",
  clientName: "",
  clientEmail: "",
  clientAddress: "",
  clientPhone: "",
};

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function SetupWizard() {
  const { completeSetup, isSaving, setupError } = useOnboarding();
  const [stepIndex, setStepIndex] = useState(-1); // -1 is the welcome screen
  const [form, setForm] = useState<FormState>(EMPTY);
  const [localError, setLocalError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const step = STEPS[stepIndex];
  const isWelcome = stepIndex === -1;
  const isLast = stepIndex === STEPS.length - 1;

  function validate(): string | null {
    if (step?.id === "business" && !form.businessName.trim()) {
      return "Your business name appears on every invoice, so it is required.";
    }
    if (step?.id === "rates") {
      const rate = /^\d+(\.\d{1,2})?$/;
      if (!rate.test(form.defaultJuniorRate.trim())) return "Enter a standard rate, like 30 or 30.00";
      if (!rate.test(form.defaultSeniorRate.trim())) return "Enter a higher rate, like 35 or 35.00";
    }
    return null;
  }

  function next() {
    const problem = validate();
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    setStepIndex((i) => i + 1);
  }

  function back() {
    setLocalError(null);
    setStepIndex((i) => i - 1);
  }

  async function finish() {
    const problem = validate();
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);

    const payload: SetupPayload = {
      businessName: form.businessName.trim(),
      businessEmail: form.businessEmail.trim() || undefined,
      businessAddress: form.businessAddress.trim() || undefined,
      abn: form.abn.trim() || undefined,
      accountName: form.accountName.trim() || undefined,
      bsb: form.bsb.trim() || undefined,
      accountNumber: form.accountNumber.trim() || undefined,
      paymentMethod: form.paymentMethod.trim() || undefined,
      defaultJuniorRate: form.defaultJuniorRate.trim(),
      defaultSeniorRate: form.defaultSeniorRate.trim(),
      invoicePrefix: form.invoicePrefix.trim() || undefined,
      nextInvoiceNumber: Number(form.nextInvoiceNumber) || 1,
      firstClient: form.clientName.trim()
        ? {
            name: form.clientName.trim(),
            billingEmail: form.clientEmail.trim() || undefined,
            address: form.clientAddress.trim() || undefined,
            phone: form.clientPhone.trim() || undefined,
          }
        : undefined,
    };

    await completeSetup(payload);
    // The status query refetches and App swaps the wizard for the dashboard.
  }

  const error = localError ?? setupError?.message ?? null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-primary/5 via-background to-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <Briefcase className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl leading-none">BillFlow</h1>
            <p className="text-xs text-muted-foreground mt-1">Smart Invoicing</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
          {!isWelcome && (
            <div className="flex items-center gap-2 mb-8">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
                  <div
                    className={
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 " +
                      (i < stepIndex
                        ? "bg-primary text-primary-foreground"
                        : i === stepIndex
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                          : "bg-secondary text-muted-foreground")
                    }
                  >
                    {i < stepIndex ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={
                        "h-0.5 flex-1 rounded " + (i < stepIndex ? "bg-primary" : "bg-border")
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {isWelcome && (
            <div className="text-center space-y-6 py-4">
              <h2 className="text-3xl font-display font-bold">Welcome to BillFlow</h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                BillFlow tracks the hours you work and turns them into invoices. Log your
                time on a weekly timesheet, then generate an invoice PDF for any date range.
              </p>
              <div className="text-left max-w-sm mx-auto space-y-3 py-2">
                {[
                  "Log sessions on a week-at-a-time timesheet",
                  "Two hourly rates, applied per session",
                  "Invoices built from unbilled hours, never billed twice",
                  "Track savings goals against what you earn",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{line}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Setup takes about a minute. Everything here can be changed later in Settings.
              </p>
              <Button size="lg" className="h-12 rounded-xl px-8" onClick={() => setStepIndex(0)}>
                Get started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {step?.id === "business" && (
            <div className="space-y-5">
              <header className="space-y-1">
                <h2 className="text-2xl font-display font-bold">Your business</h2>
                <p className="text-sm text-muted-foreground">
                  This appears at the top of every invoice you send.
                </p>
              </header>
              <Field id="businessName" label="Business or your name">
                <Input id="businessName" value={form.businessName} onChange={set("businessName")}
                  placeholder="Jane Smith" className="h-11 rounded-xl" />
              </Field>
              <Field id="businessEmail" label="Email" hint="Optional. Shown on the invoice so clients can reach you.">
                <Input id="businessEmail" type="email" value={form.businessEmail}
                  onChange={set("businessEmail")} placeholder="you@example.com" className="h-11 rounded-xl" />
              </Field>
              <Field id="abn" label="Tax or business number" hint="Optional. ABN in Australia, VAT or EIN elsewhere.">
                <Input id="abn" value={form.abn} onChange={set("abn")}
                  placeholder="12 345 678 901" className="h-11 rounded-xl" />
              </Field>
            </div>
          )}

          {step?.id === "payment" && (
            <div className="space-y-5">
              <header className="space-y-1">
                <h2 className="text-2xl font-display font-bold">Getting paid</h2>
                <p className="text-sm text-muted-foreground">
                  Printed on your invoices so clients know where to send the money. All optional,
                  and stored only on this computer.
                </p>
              </header>
              <Field id="accountName" label="Account name">
                <Input id="accountName" value={form.accountName} onChange={set("accountName")}
                  placeholder="Account holder name" className="h-11 rounded-xl" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field id="bsb" label="BSB or sort code">
                  <Input id="bsb" value={form.bsb} onChange={set("bsb")}
                    placeholder="000-000" className="h-11 rounded-xl" />
                </Field>
                <Field id="accountNumber" label="Account number">
                  <Input id="accountNumber" value={form.accountNumber} onChange={set("accountNumber")}
                    placeholder="123456" className="h-11 rounded-xl" />
                </Field>
              </div>
              <Field id="paymentMethod" label="Payment method">
                <Input id="paymentMethod" value={form.paymentMethod} onChange={set("paymentMethod")}
                  placeholder="Bank Transfer" className="h-11 rounded-xl" />
              </Field>
            </div>
          )}

          {step?.id === "rates" && (
            <div className="space-y-5">
              <header className="space-y-1">
                <h2 className="text-2xl font-display font-bold">Your rates</h2>
                <p className="text-sm text-muted-foreground">
                  BillFlow supports two hourly rates. When you log a session you pick which one
                  applies, so you can charge more for specialised work.
                </p>
              </header>
              <div className="grid grid-cols-2 gap-4">
                <Field id="defaultJuniorRate" label="Standard rate" hint="Your usual hourly rate.">
                  <Input id="defaultJuniorRate" inputMode="decimal" value={form.defaultJuniorRate}
                    onChange={set("defaultJuniorRate")} placeholder="30" className="h-11 rounded-xl" />
                </Field>
                <Field id="defaultSeniorRate" label="Higher rate" hint="For harder or specialised work.">
                  <Input id="defaultSeniorRate" inputMode="decimal" value={form.defaultSeniorRate}
                    onChange={set("defaultSeniorRate")} placeholder="35" className="h-11 rounded-xl" />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                If you only have one rate, put the same number in both.
              </p>
            </div>
          )}

          {step?.id === "invoicing" && (
            <div className="space-y-5">
              <header className="space-y-1">
                <h2 className="text-2xl font-display font-bold">Invoice numbers</h2>
                <p className="text-sm text-muted-foreground">
                  Each invoice gets a number automatically. If you have invoiced before, start
                  the count where you left off so your records stay continuous.
                </p>
              </header>
              <div className="grid grid-cols-2 gap-4">
                <Field id="invoicePrefix" label="Prefix">
                  <Input id="invoicePrefix" value={form.invoicePrefix} onChange={set("invoicePrefix")}
                    placeholder="INV-" className="h-11 rounded-xl" />
                </Field>
                <Field id="nextInvoiceNumber" label="Start numbering at">
                  <Input id="nextInvoiceNumber" inputMode="numeric" value={form.nextInvoiceNumber}
                    onChange={set("nextInvoiceNumber")} placeholder="1" className="h-11 rounded-xl" />
                </Field>
              </div>
              <div className="rounded-xl bg-secondary/60 px-4 py-3 text-sm">
                Your next invoice will be{" "}
                <span className="font-mono font-semibold">
                  {(form.invoicePrefix || "") +
                    String(Number(form.nextInvoiceNumber) || 1).padStart(4, "0")}
                </span>
              </div>
            </div>
          )}

          {step?.id === "client" && (
            <div className="space-y-5">
              <header className="space-y-1">
                <h2 className="text-2xl font-display font-bold">First client</h2>
                <p className="text-sm text-muted-foreground">
                  Add someone you bill. You can skip this and add clients later.
                </p>
              </header>
              <Field id="clientName" label="Client name">
                <Input id="clientName" value={form.clientName} onChange={set("clientName")}
                  placeholder="Acme Pty Ltd" className="h-11 rounded-xl" />
              </Field>
              <Field id="clientEmail" label="Billing email" hint="Where invoices get sent.">
                <Input id="clientEmail" type="email" value={form.clientEmail} onChange={set("clientEmail")}
                  placeholder="accounts@acme.com" className="h-11 rounded-xl" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field id="clientAddress" label="Address">
                  <Input id="clientAddress" value={form.clientAddress} onChange={set("clientAddress")}
                    className="h-11 rounded-xl" />
                </Field>
                <Field id="clientPhone" label="Phone">
                  <Input id="clientPhone" value={form.clientPhone} onChange={set("clientPhone")}
                    className="h-11 rounded-xl" />
                </Field>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isWelcome && (
            <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-border">
              <Button variant="ghost" onClick={back} disabled={isSaving}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Step {stepIndex + 1} of {STEPS.length}
                </span>
                <Button
                  onClick={isLast ? finish : next}
                  disabled={isSaving}
                  className="h-11 rounded-xl px-6"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isLast ? (
                    <>
                      Finish setup
                      <Check className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
