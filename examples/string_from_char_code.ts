// Phase 1.5-6 prep #12: String.fromCharCode(n: number): string.
// ASCII-only (0..127); NaN / negative / >= 128 abort at runtime.
// This is the syntactic sugar the lexer needs to decode `\xNN` escapes
// into single-byte strings.

// --- basic ASCII letters / digits ---
console.log(String.fromCharCode(65));   // A
console.log(String.fromCharCode(97));   // a
console.log(String.fromCharCode(48));   // 0
console.log(String.fromCharCode(122));  // z

// --- result is a topaz_string of length 1 ---
const a: string = String.fromCharCode(66);
console.log(a);          // B
console.log(a.length);   // 1

// --- round-trip with charCodeAt ---
const c: string = String.fromCharCode(72);
console.log(c.charCodeAt(0));  // 72

// --- concat builds longer strings (lexer hex-escape decoding pattern) ---
let s: string = "";
s = s + String.fromCharCode(72);  // H
s = s + String.fromCharCode(101); // e
s = s + String.fromCharCode(108); // l
s = s + String.fromCharCode(108); // l
s = s + String.fromCharCode(111); // o
console.log(s);          // Hello
console.log(s.length);   // 5

// --- hi * 16 + lo style (the lexer's `\xNN` decoder) ---
function fromHex(hi: number, lo: number): string {
  return String.fromCharCode(hi * 16 + lo);
}
console.log(fromHex(4, 1));   // A (0x41)
console.log(fromHex(7, 10));  // z (0x7a)

// --- in template literal substitution ---
const ch: string = String.fromCharCode(33);
console.log(`mark=${ch}`);  // mark=!

// --- boundary: 0 → null byte (length is 1, content is \0) ---
const nul: string = String.fromCharCode(0);
console.log(nul.length);  // 1

// --- boundary: 127 (DEL) is the upper ASCII edge ---
const del: string = String.fromCharCode(127);
console.log(del.length);        // 1
console.log(del.charCodeAt(0)); // 127

// --- integer truncation toward zero on non-integer numeric args ---
console.log(String.fromCharCode(65.9));  // A (65)

// --- function returning the result ---
function letter(i: number): string {
  return String.fromCharCode(65 + i);
}
console.log(letter(0));  // A
console.log(letter(3));  // D
console.log(letter(25)); // Z

// --- loop builds an alphabet ---
let alpha: string = "";
let i: number = 0;
while (i < 5) {
  alpha = alpha + String.fromCharCode(97 + i);
  i = i + 1;
}
console.log(alpha);  // abcde
