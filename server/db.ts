import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function getPoolConfig(): pg.PoolConfig {
  if (process.env.PGHOST) {
    console.log(`[db] Connecting via PG env vars - host: ${process.env.PGHOST}, port: ${process.env.PGPORT || 5432}, database: ${process.env.PGDATABASE}`);
    return {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || "5432", 10),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    };
  }

  const dbUrl = new URL(process.env.DATABASE_URL!);
  console.log(`[db] Connecting via DATABASE_URL - host: ${dbUrl.hostname}, port: ${dbUrl.port || 5432}, database: ${dbUrl.pathname.slice(1)}`);
  return { connectionString: process.env.DATABASE_URL };
}

export const pool = new Pool(getPoolConfig());

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export const db = drizzle(pool, { schema });
