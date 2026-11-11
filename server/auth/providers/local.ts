import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express, RequestHandler } from "express";
import { z } from "zod";

import { getSession } from "../session";
import { authStorage, toPublicUser } from "../storage";
import { hashPassword, verifyPassword } from "../password";
import type { AuthProvider, SessionUser } from "../types";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registrationSchema = credentialsSchema.extend({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});

// routes.ts reads `req.user.claims.sub`, so the local provider produces the
// same shape the OIDC provider did.
function toSessionUser(user: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}): SessionUser {
  return {
    claims: {
      sub: user.id,
      email: user.email ?? undefined,
      first_name: user.firstName ?? undefined,
      last_name: user.lastName ?? undefined,
      profile_image_url: user.profileImageUrl ?? undefined,
    },
  };
}

async function setup(app: Express): Promise<void> {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await authStorage.getUserByEmail(email);
          if (!user || !(await verifyPassword(password, user.passwordHash))) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, toSessionUser(user));
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );

  // Only the user id goes into the session; the rest is re-read per request so
  // profile edits and deletions take effect immediately.
  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as SessionUser).claims.sub);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authStorage.getUser(id);
      if (!user) return done(null, false);
      done(null, toSessionUser(user));
    } catch (error) {
      done(error as Error);
    }
  });
}

function registerRoutes(app: Express): void {
  app.post("/api/register", async (req, res, next) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { email, password, firstName, lastName } = parsed.data;

    try {
      if (await authStorage.getUserByEmail(email)) {
        return res
          .status(409)
          .json({ message: "An account with that email already exists" });
      }

      const user = await authStorage.createUser({
        email,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        passwordHash: await hashPassword(password),
      });

      req.logIn(toSessionUser(user), (err) => {
        if (err) return next(err);
        res.status(201).json(toPublicUser(user));
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    passport.authenticate(
      "local",
      (err: unknown, user: SessionUser | false, info?: { message?: string }) => {
        if (err) return next(err);
        if (!user) {
          return res
            .status(401)
            .json({ message: info?.message ?? "Invalid email or password" });
        }
        req.logIn(user, async (loginErr) => {
          if (loginErr) return next(loginErr);
          const stored = await authStorage.getUser(user.claims.sub);
          res.json(stored ? toPublicUser(stored) : { id: user.claims.sub });
        });
      },
    )(req, res, next);
  });

  const logout: RequestHandler = (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        // GET is a browser navigation (legacy link); POST is the fetch path.
        if (req.method === "GET") return res.redirect("/");
        res.status(204).end();
      });
    });
  };

  app.get("/api/logout", logout);
  app.post("/api/logout", logout);

  app.get("/api/auth/user", isAuthenticated, async (req, res, next) => {
    try {
      const user = await authStorage.getUser((req.user as SessionUser).claims.sub);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      res.json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  });
}

const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

const localProvider: AuthProvider = { setup, registerRoutes, isAuthenticated };
export default localProvider;
