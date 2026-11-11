import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool as dbPool } from "../db";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function getSession() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET must be set. Generate one with: openssl rand -base64 32",
    );
  }

  const PgStore = connectPg(session);
  const store = new PgStore({
    pool: dbPool,
    createTableIfMissing: true,
    ttl: SESSION_TTL_MS / 1000, // connect-pg-simple expects seconds
    tableName: "sessions",
  });

  return session({
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Secure cookies require HTTPS; forcing this on breaks local http dev.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
    },
  });
}
