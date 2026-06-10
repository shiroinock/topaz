// Phase 1.5-6 prep #25: node:url.fileURLToPath(url) + `import.meta.url`.
// `import.meta.url` resolves to "file://<realpath of executable>"; piping it
// through fileURLToPath drops the scheme and percent-decodes, recovering the
// path Node would expose. Used by cli.ts:85 to anchor the runtime/ dir.

import { fileURLToPath } from "node:url";
import { basename, dirname } from "node:path";

// `import.meta.url` is a string and must start with "file://".
const u: string = import.meta.url;
console.log(u.length > 7);
console.log(u.slice(0, 7) === "file://");

// fileURLToPath strips the scheme; the resulting path is absolute.
const p: string = fileURLToPath(u);
console.log(p.length > 0);
console.log(p.slice(0, 1) === "/");

// basename(p) matches the binary name (run_case passes "$name" as -o
// build/$name, so the executable is named after the test slug).
console.log(basename(p));

// Composable with dirname / basename: the parent of the binary path is a
// non-empty directory, and joining basename onto it recovers the input.
const d: string = dirname(p);
console.log(d.length > 0);
console.log(d.slice(0, 1) === "/");

// Percent-encoded literal: fileURLToPath decodes %20 to ' ' etc. The string
// stays a `file://` URL with a single authority slash.
const enc: string = "file:///tmp/a%20b/c%2Fd";
console.log(fileURLToPath(enc));

// `localhost` authority is treated the same as empty authority.
const lh: string = "file://localhost/etc/hosts";
console.log(fileURLToPath(lh));

// Byte-preserving percent decode: avoid printing raw NUL/high bytes directly,
// but lock their length and byte values.
const bytes: string = fileURLToPath("file:///tmp/%00%ff");
console.log(bytes.length);
console.log(bytes.charCodeAt(5));
console.log(bytes.charCodeAt(6));
