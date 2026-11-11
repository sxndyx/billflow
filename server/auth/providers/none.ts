// Single-user mode: no sign-in at all.
//
// Every request is treated as the one account that owns the data. Intended for
// a local, single-user install. Never expose an app running this provider to a
// network you do not control — there is no access check of any kind.
import type { Express, RequestHandler } from "express";
import { asc } from "drizzle-orm";

import { db } from "../../db";
import { users } from "@shared/models/auth";
import { authStorage, toPublicUser } from "../storage";
import type { AuthProvider, SessionUser } from "../types";

let owner: SessionUser | null = null;
let ownerId: string | null = null;

async function resolveOwner() {
  const explicit = process.env.SINGLE_USER_ID;
  if (explicit) {
    const found = await authStorage.getUser(explicit);
    if (!found) {
      throw new Error(
        `SINGLE_USER_ID="${explicit}" does not match any row in the users table.`,
      );
    }
    return found;
  }

  // Otherwise the oldest account wins — after the Replit import that is the
  // imported owner, and on a fresh database we create one.
  const [first] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
  if (first) return first;

  return authStorage.createUser({
    email: process.env.SINGLE_USER_EMAIL ?? "owner@localhost",
    firstName: "Owner",
  });
}

async function setup(_app: Express): Promise<void> {
  const user = await resolveOwner();
  ownerId = user.id;
  owner = {
    claims: {
      sub: user.id,
      email: user.email ?? undefined,
      first_name: user.firstName ?? undefined,
      last_name: user.lastName ?? undefined,
      profile_image_url: user.profileImageUrl ?? undefined,
    },
  };
  console.log(
    `[auth] single-user mode - every request acts as ${user.email ?? user.id} (id ${user.id})`,
  );
}

function registerRoutes(app: Express): void {
  app.get("/api/auth/config", (_req, res) => {
    res.json({ provider: "none", canSignOut: false, singleUser: true });
  });

  app.get("/api/auth/user", isAuthenticated, async (_req, res, next) => {
    try {
      const user = await authStorage.getUser(ownerId!);
      res.json(user ? toPublicUser(user) : null);
    } catch (error) {
      next(error);
    }
  });

  // Kept so any stale client link does not 404; there is nothing to log out of.
  const noop: RequestHandler = (req, res) => {
    if (req.method === "GET") return res.redirect("/");
    res.status(204).end();
  };
  app.get("/api/logout", noop);
  app.post("/api/logout", noop);
}

const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!owner) {
    return res.status(503).json({ message: "Auth is not initialised" });
  }
  (req as any).user = owner;
  next();
};

const noneProvider: AuthProvider = { setup, registerRoutes, isAuthenticated };
export default noneProvider;
