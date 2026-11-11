import type { Express, RequestHandler } from "express";
import type { AuthProvider } from "./types";

// "none" is the default: this is a single-user local app.
const PROVIDER = (process.env.AUTH_PROVIDER ?? "none").toLowerCase();

let active: AuthProvider | null = null;

export async function setupAuth(app: Express): Promise<void> {
  if (PROVIDER === "none") {
    active = (await import("./providers/none")).default;
  } else if (PROVIDER === "replit") {
    active = (await import("./providers/replit")).default;
  } else if (PROVIDER === "local") {
    active = (await import("./providers/local")).default;
  } else {
    throw new Error(
      `Unknown AUTH_PROVIDER "${PROVIDER}". Expected "none", "local" or "replit".`,
    );
  }

  console.log(`[auth] using "${PROVIDER}" provider`);
  await active.setup(app);
}

export function registerAuthRoutes(app: Express): void {
  if (!active) throw new Error("setupAuth() must run before registerAuthRoutes()");
  active.registerRoutes(app);
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!active) {
    return res.status(503).json({ message: "Auth is not initialised" });
  }
  return active.isAuthenticated(req, res, next);
};

export { authStorage, toPublicUser, type IAuthStorage } from "./storage";
export { getSession } from "./session";
export type { SessionUser, AuthProvider } from "./types";
