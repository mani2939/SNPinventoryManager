import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";
// Read from stdin to keep the password out of process arguments and shell history.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stderr,
});
rl.question(
  "Password to hash (input is visible in this local terminal): ",
  (password) => {
    const salt = randomBytes(16).toString("hex");
    console.log(`${salt}:${scryptSync(password, salt, 64).toString("hex")}`);
    rl.close();
  },
);
