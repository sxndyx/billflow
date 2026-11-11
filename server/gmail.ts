// Gmail sending via standard Google OAuth2.
//
// On Replit this used the proprietary Connectors API (REPLIT_CONNECTORS_HOSTNAME
// + REPL_IDENTITY), which does not exist off-platform. This version uses a
// normal OAuth2 client with a long-lived refresh token.
//
// Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// Optional env: GMAIL_SENDER_EMAIL, GOOGLE_REDIRECT_URI
//
// Run `npm run gmail:auth` to mint a refresh token.
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

export const DEFAULT_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:5055/oauth2callback";

export class GmailNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Gmail is not configured. Missing environment variable(s): ${missing.join(", ")}. ` +
        `Run "npm run gmail:auth" to obtain a refresh token.`,
    );
    this.name = "GmailNotConfiguredError";
  }
}

let cachedClient: OAuth2Client | null = null;

export function buildOAuthClient(refreshToken?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) throw new GmailNotConfiguredError(missing);

  const client = new google.auth.OAuth2(clientId, clientSecret, DEFAULT_REDIRECT_URI);
  if (refreshToken) client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function getAuthenticatedClient(): OAuth2Client {
  if (cachedClient) return cachedClient;

  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) throw new GmailNotConfiguredError(["GOOGLE_REFRESH_TOKEN"]);

  // googleapis refreshes the access token on demand and caches it in memory.
  cachedClient = buildOAuthClient(refreshToken);
  return cachedClient;
}

export async function getGmailClient() {
  return google.gmail({ version: "v1", auth: getAuthenticatedClient() });
}

export async function getGmailStatus(): Promise<{
  connected: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const auth = getAuthenticatedClient();

    // Exchanges the refresh token for an access token; proves the grant is live.
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Google returned no access token");

    let email = process.env.GMAIL_SENDER_EMAIL;
    if (!email) {
      // Only works if the grant includes a read scope; harmless if it doesn't.
      try {
        const gmail = google.gmail({ version: "v1", auth });
        const profile = await gmail.users.getProfile({ userId: "me" });
        email = profile.data.emailAddress ?? undefined;
      } catch {
        // gmail.send alone cannot read the profile — set GMAIL_SENDER_EMAIL.
      }
    }

    return { connected: true, email };
  } catch (error: any) {
    // A revoked or expired grant surfaces here rather than crashing the route.
    cachedClient = null;
    console.log("[gmail] status check failed:", error.message);
    return { connected: false, error: error.message };
  }
}

function buildRawMessage(
  toEmail: string,
  subject: string,
  body: string,
  pdfBuffer: Buffer,
  pdfFilename: string,
): string {
  const boundary = `boundary_${Date.now().toString(36)}`;
  const from = process.env.GMAIL_SENDER_EMAIL;

  const lines = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${toEmail}`,
    // RFC 2047 encode so non-ASCII subjects survive.
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf-8").toString("base64"),
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    "",
    pdfBuffer.toString("base64"),
    "",
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function sendInvoiceEmail(
  toEmail: string,
  subject: string,
  body: string,
  pdfBuffer: Buffer,
  pdfFilename: string,
): Promise<void> {
  const gmail = await getGmailClient();
  const raw = buildRawMessage(toEmail, subject, body, pdfBuffer, pdfFilename);

  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      return;
    } catch (error: any) {
      lastError = error;
      const status = error.code ?? error.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
