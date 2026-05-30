// Phase 1.5-6 prep #24: node:child_process.execFileSync(cmd: string,
// args: string[], { stdio: "inherit" }): void. fork + execvp + waitpid; the
// child inherits the parent's stdin/stdout/stderr. Same call-site-shortcut
// path as writeFileSync (prep #19) / mkdirSync (prep #20). Returns void: it
// can appear as a statement but cannot be used as a value.

import { execFileSync } from "node:child_process";

// --- basic: pass an array literal; stdio inherit relays to our stdout ---
execFileSync("/bin/echo", ["hello", "from", "child"], { stdio: "inherit" });
console.log("parent line");

// --- args via a variable typed as string[] ---
const args: string[] = ["one", "two"];
execFileSync("/bin/echo", args, { stdio: "inherit" });

// --- empty args list: echo prints just a newline ---
const empty: string[] = [];
execFileSync("/bin/echo", empty, { stdio: "inherit" });

// --- cmd and element via template literal / expression ---
const tool = "echo";
const where = `/bin/${tool}`;
execFileSync(where, [`x=${1 + 1}`], { stdio: "inherit" });
