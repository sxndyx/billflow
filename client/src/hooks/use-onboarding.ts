import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface OnboardingStatus {
  onboarded: boolean;
  tourCompleted: boolean;
  checklist: {
    hasClient: boolean;
    hasSession: boolean;
    hasInvoice: boolean;
  };
}

export interface SetupPayload {
  businessName: string;
  businessEmail?: string;
  businessAddress?: string;
  abn?: string;
  accountName?: string;
  bsb?: string;
  accountNumber?: string;
  paymentMethod?: string;
  defaultJuniorRate: string;
  defaultSeniorRate: string;
  invoicePrefix?: string;
  nextInvoiceNumber?: number;
  firstClient?: {
    name: string;
    billingEmail?: string;
    address?: string;
    phone?: string;
  };
}

const STATUS_KEY = ["/api/onboarding/status"];

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body?.message) return body.message;
  } catch {
    // Non-JSON body; fall through.
  }
  return res.statusText || "Request failed";
}

async function fetchStatus(): Promise<OnboardingStatus> {
  const res = await fetch("/api/onboarding/status", { credentials: "include" });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function useOnboarding() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<OnboardingStatus>({
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
    retry: false,
    staleTime: 1000 * 30,
  });

  const completeSetup = useMutation({
    mutationFn: async (payload: SetupPayload) => {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    onSuccess: () => {
      // Settings, clients and the dashboard all change as a result.
      queryClient.invalidateQueries();
    },
  });

  const dismissTour = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/dismiss-tour", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });

  return {
    status,
    isLoading,
    needsSetup: status ? !status.onboarded : false,
    showChecklist: status ? status.onboarded && !status.tourCompleted : false,
    completeSetup: completeSetup.mutateAsync,
    isSaving: completeSetup.isPending,
    setupError: completeSetup.error as Error | null,
    dismissTour: dismissTour.mutate,
  };
}
