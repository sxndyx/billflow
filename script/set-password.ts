// Set or reset a local password for an existing user.
//
//   npm run user:password -- someone@example.com
//
// Useful after importing data from Replit: those rows were created by OIDC and
// have no password_hash, so their owner cannot sign in with the local provider.
import "dotenv/config";
import readline from "readline";
import { eq, sql } from "drizzle-orm";

import { db, pool } from "../server/db";
import { users } from "../shared/models/auth";
import { hashPassword } from "../server/auth/password";

// Interactive prompts when attached to a terminal; otherwise consume piped
// lines so the script stays scriptable (e.g. in CI or a setup script).
let piped: string[] | null = null;

async function readPipedLines(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

async function ask(question: string, hidden = false): Promise<string> {
  if (!process.stdin.isTTY) {
    piped ??= await readPipedLines();
    const line = piped.shift();
    if (line === undefined) {
      throw new Error(`Ran out of piped input while asking: ${question.trim()}`);
    }
    return line;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  if (hidden) {
    // Suppress echo so the password never appears on screen or in scrollback.
    (rl as any)._writeToOutput = function (chunk: string) {
      if (chunk.includes(question)) this.output.write(chunk);
    };
  }

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run user:password -- <email>");
    process.exit(1);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);

  if (!user) {
    console.error(`No user found with email "${email}".`);
    const all = await db.select({ email: users.email }).from(users);
    if (all.length) {
      console.error("\nKnown accounts:");
      for (const row of all) console.error(`  ${row.email ?? "(no email)"}`);
    }
    process.exit(1);
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  console.log(`\nSetting password for ${user.email}${name ? ` (${name})` : ""}`);
  console.log(`user id: ${user.id}`);
  if (user.passwordHash) console.log("note: this account already has a password; it will be replaced.");
  console.log("");

  const password = await ask("New password (min 8 chars): ", true);
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const confirm = await ask("Confirm password: ", true);
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  console.log(`\nDone. Sign in at http://localhost:${process.env.PORT || 5001} with ${user.email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
