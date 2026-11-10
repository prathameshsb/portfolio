import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { hashOwnerPassword } from "../lib/owner-access/core";

async function main() {
  if (!process.stdin.isTTY) throw new Error("Run this locally in an interactive terminal. No password arguments or environment variables are accepted.");
  const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });
  try {
    process.stderr.write("Owner password (10+ bytes; input hidden): ");
    const password = await input.question("");
    process.stderr.write("\nConfirm password (input hidden): ");
    const confirmation = await input.question("");
    process.stderr.write("\n");
    if (password !== confirmation) throw new Error("Passwords did not match. Nothing was created.");
    const hash = await hashOwnerPassword(password);
    process.stderr.write("Save these as server-only environment values locally and in Netlify. Keep them out of Git and chat.\n");
    process.stdout.write(`OWNER_PASSWORD_HASH='${hash}'\nOWNER_SESSION_SECRET='${randomBytes(32).toString("hex")}'\n`);
  } finally { input.close(); }
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Owner setup failed."}\n`);
  process.exitCode = 1;
});
