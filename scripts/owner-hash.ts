// Makes the password hash for the owner or co-owner sign-in. The password is typed here, hidden, and never stored or printed.
// Usage:  npm run owner:hash -- owner     or     npm run owner:hash -- co-owner
// Put the printed line in the app's environment (Nebula panel > Environment), never in git.
import { hashPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "../src/platform/password.ts";

const who = process.argv[2];
if (who !== "owner" && who !== "co-owner") {
  process.stderr.write("Usage: npm run owner:hash -- owner|co-owner\n");
  process.exit(1);
}
if (!process.stdin.isTTY) {
  process.stderr.write("Run this in a terminal so the password can be typed without showing it.\n");
  process.exit(1);
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const input = process.stdin;
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); } // Ctrl+C
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}

const first = await ask(`New ${who} password (${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters, nothing is shown while typing): `);
if (first.length < MIN_PASSWORD_LENGTH || first.length > MAX_PASSWORD_LENGTH) {
  process.stderr.write(`The password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.\n`);
  process.exit(1);
}
const second = await ask("Type it again: ");
if (first !== second) {
  process.stderr.write("The two passwords differ. Nothing was made.\n");
  process.exit(1);
}
const variable = who === "owner" ? "OWNER_PASSWORD_HASH" : "COOWNER_PASSWORD_HASH";
process.stdout.write(`\nAdd this line to the environment of the app:\n\n${variable}=${await hashPassword(first)}\n\n`);
