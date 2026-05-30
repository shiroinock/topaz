// Phase 1.5-6f: one-argument String.prototype.startsWith / .endsWith.
// Topaz keeps these byte-wise over ASCII topaz_string and does not support
// JS optional position / endPosition arguments.

const spec: string = "./loader.ts";

console.log(spec.startsWith("./"));
console.log(spec.startsWith("../"));
console.log(spec.endsWith(".ts"));
console.log(spec.endsWith(".js"));

console.log(spec.startsWith(""));
console.log(spec.endsWith(""));

console.log("ab".startsWith("abc"));
console.log("ab".endsWith("abc"));
console.log("abc".startsWith("abc"));
console.log("abc".endsWith("abc"));

const sliced: string = "xxmodule.js".slice(2);
console.log(sliced.startsWith("module"));
console.log(sliced.endsWith(".js"));

const part: string = "pa";
console.log((part + "th.ts").startsWith("path"));

const middle: string = "az";
console.log(`top${middle}`.endsWith("paz"));

function classifyImport(path: string): string {
  if (path.startsWith("./") || path.startsWith("../")) {
    return "relative";
  }
  return "bare";
}

console.log(classifyImport("./a"));
console.log(classifyImport("../b"));
console.log(classifyImport("node:fs"));

function extensionKind(path: string): string {
  if (path.endsWith(".js") || path.endsWith(".ts")) {
    return "module";
  }
  return "other";
}

console.log(extensionKind("loader.js"));
console.log(extensionKind("codegen.ts"));
console.log(extensionKind("README.md"));
