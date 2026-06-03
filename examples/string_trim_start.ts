// Phase 1.5-6i prep: zero-argument ASCII String.prototype.trimStart.

const spaced: string = "  topaz".trimStart();
console.log(spaced);
console.log(spaced.length);

const controls: string = "\t\n\r\x0c\x0b  ok".trimStart();
console.log(controls);
console.log(controls.length);

const already: string = "ready".trimStart();
console.log(already);
console.log(already.length);

const empty: string = " \t\n".trimStart();
console.log(empty.length);
console.log(empty === "");

console.log("pre-" + "   value".trimStart());
console.log("  abc".trimStart().slice(1));
console.log("  x".trimStart().repeat(3));

function normalize(input: string): string {
  return input.trimStart();
}
console.log(normalize(" \tname"));
