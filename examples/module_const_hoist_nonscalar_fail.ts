// Phase 1.5-6 prep #9: string literal initializers stay in main() body for
// now (file-scope C `static const topaz_string = {"...", N}` needs a
// separate accommodation — deferred). A function body referencing such a
// const surfaces "unknown identifier" with this build, matching the
// behaviour for `new` / call / object literal initializers. When the
// follow-up step adds string-literal hoisting, this regression flips to a
// positive case.

const GREETING: string = "hi";

function shout(): string {
  return GREETING + "!";
}

console.log(shout());
