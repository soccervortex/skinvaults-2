// Fails when a tracked or staged file looks like it contains a credential. Runs in `npm test` and in the pre-commit hook.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  [/https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/, "Discord webhook URL"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/, "Stripe key"],
  [/mongodb(\+srv)?:\/\/[^\s:@]+:[^\s@]+@/, "database URL with password"],
  [/postgres(ql)?:\/\/[^\s:@]+:(?!password@|pw@|\$)[^\s@]{6,}@/, "database URL with password"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
];
const SKIP = /(^|\/)(package-lock\.json|check-secrets\.mjs|.*\.test\.ts)$/;

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean);
let bad = 0;
for (const file of files) {
  if (SKIP.test(file)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const [re, label] of PATTERNS) {
    if (re.test(text)) { console.error(`SECRET? ${file}: looks like a ${label}`); bad++; }
  }
}
if (bad > 0) { console.error(`${bad} possible secret(s) found. Remove them and rotate the credential.`); process.exit(1); }
console.log(`check-secrets: ${files.length} files clean`);
