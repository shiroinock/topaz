// Phase 1.5-6 prep #16: global parseInt(s, radix) / parseFloat(s): number.
// Mirrors src/topaz_parser.ts's parseNumberLiteral — the self-hosting blocker
// this substep clears. parseInt requires an explicit radix; both return number.

// --- the self-hosted number-literal parser pattern (hex / binary / float) ---
function parseNum(text: string): number {
  if (text.length >= 2 && text.charCodeAt(0) === 48) {
    const c1: number = text.charCodeAt(1);
    if (c1 === 120 || c1 === 88) {
      return parseInt(text.slice(2), 16);
    }
    if (c1 === 98 || c1 === 66) {
      return parseInt(text.slice(2), 2);
    }
  }
  return parseFloat(text);
}

console.log(parseNum("0xff"));   // 255
console.log(parseNum("0x10"));   // 16
console.log(parseNum("0b101"));  // 5
console.log(parseNum("0B1010")); // 10
console.log(parseNum("3.14"));   // 3.14
console.log(parseNum("42"));     // 42
console.log(parseNum("0"));      // 0
console.log(parseNum("100"));    // 100

// --- direct parseInt with assorted radixes ---
console.log(parseInt("7b", 16));  // 123
console.log(parseInt("-7b", 16)); // -123
console.log(parseInt("1111", 2)); // 15
console.log(parseInt("zz", 36));  // 1295
console.log(parseInt("777", 8));  // 511
console.log(parseInt(" \t+10z", 10)); // 10
console.log(parseInt("123x", 0));     // 123
console.log(parseInt("010", 0));      // 8
console.log(parseInt("0x10", 0));     // 16
console.log(parseInt("0Xf", 16));     // 15

// --- parseFloat ---
console.log(parseFloat("2.5"));   // 2.5
console.log(parseFloat("100"));   // 100

// --- divergence from JS: invalid prefix / out-of-range radix → NaN ---
console.log(parseInt("xyz", 10)); // NaN (no digit consumed)
console.log(parseInt("10", 99));  // NaN (radix outside [2,36])
