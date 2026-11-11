import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "@shared/models/auth";

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  firstName?: string;
  lastName?: string;
}

const USER_KEY = ["/api/auth/user"];
const CONFIG_KEY = ["/api/auth/config"];

export interface AuthConfig {
  provider: "none" | "local" | "replit";
  canSignOut: boolean;
  singleUser: boolean;
}

async function fetchConfig(): Promise<AuthConfig> {
  const response = await fetch("/api/auth/config", { credentials: "include" });
  // Providers that predate this endpoint simply have sign-out available.
  if (!response.ok) {
    return { provider: "local", canSignOut: true, singleUser: false };
  }
  return response.json();
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body?.message) return body.message;
  } catch {
    // Non-JSON error body — fall through to the status text.
  }
  return response.statusText || "Request failed";
}

async function fetchUser(): Promise<PublicUser | null> {
  const response = await fetch("/api/auth/user", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

async function post<T>(url: string, body?: unknown): Promise<T | null> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) throw new Error(await parseError(response));
  if (response.status === 204) return null;
  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: config } = useQuery<AuthConfig>({
    queryKey: CONFIG_KEY,
    queryFn: fetchConfig,
    retry: false,
    staleTime: Infinity,
  });

  const { data: user, isLoading } = useQuery<PublicUser | null>({
    queryKey: USER_KEY,
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: Credentials) =>
      post<PublicUser>("/api/login", credentials),
    onSuccess: (data) => {
      queryClient.setQueryData(USER_KEY, data);
      queryClient.invalidateQueries();
    },
  });

  const registerMutation = useMutation({
    mutationFn: (registration: Registration) =>
      post<PublicUser>("/api/register", registration),
    onSuccess: (data) => {
      queryClient.setQueryData(USER_KEY, data);
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => post<null>("/api/logout"),
    onSuccess: () => {
      queryClient.setQueryData(USER_KEY, null);
      // Drop every cached query so the next account starts clean.
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    canSignOut: config?.canSignOut ?? true,
    isSingleUser: config?.singleUser ?? false,

    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error as Error | null,

    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error as Error | null,

    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
