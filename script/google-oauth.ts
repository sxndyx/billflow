// One-off helper: mint a Gmail refresh token for local development.
//
//   1. Create an OAuth client (type "Web application") in Google Cloud Console
//      and add http://localhost:5055/oauth2callback as an authorised redirect.
//   2. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
//   3. npm run gmail:auth
//   4. Paste the printed refresh token into .env as GOOGLE_REFRESH_TOKEN
import "dotenv/config";
import http from "http";
import { buildOAuthClient, GMAIL_SCOPES, DEFAULT_REDIRECT_URI } from "../server/gmail";

const PORT = Number(new URL(DEFAULT_REDIRECT_URI).port || 5055);

const oauth2Client = buildOAuthClient();

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh token even on repeat runs
  scope: GMAIL_SCOPES,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", DEFAULT_REDIRECT_URI);
  if (url.pathname !== new URL(DEFAULT_REDIRECT_URI).pathname) {
    res.writeHead(404).end("Not found");
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Authorisation failed: ${error ?? "no code returned"}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Done.</h1><p>Return to your terminal.</p>");

    if (!tokens.refresh_token) {
      console.error(
        "\nGoogle did not return a refresh token. Revoke the app at " +
          "https://myaccount.google.com/permissions and run this again.",
      );
      process.exitCode = 1;
    } else {
      console.log("\nAdd these lines to .env:\n");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log("GMAIL_SENDER_EMAIL=you@example.com  # the account you just authorised\n");
    }
  } catch (err) {
    res.writeHead(500).end("Token exchange failed");
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log(`\nListening on ${DEFAULT_REDIRECT_URI}`);
  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl + "\n");
});
