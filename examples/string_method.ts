// Phase 1.5-6 prep #10: String.prototype.charCodeAt / .slice.
// ASCII-only, integer-truncated index for charCodeAt (NaN if OOB or negative).
// .slice lowers through the runtime prelude; undefined / negative /
// out-of-range arguments keep the original byte-slice behavior.

const s: string = "hello";

// --- .length still works (property access, unchanged) ---
console.log(s.length);  // 5

// --- charCodeAt: ASCII codepoints ---
console.log(s.charCodeAt(0));  // 104 (h)
console.log(s.charCodeAt(1));  // 101 (e)
console.log(s.charCodeAt(1.8));  // 101 (fraction truncates toward zero)
console.log(s.charCodeAt(4));  // 111 (o)

// --- charCodeAt: out-of-range → NaN ---
// NaN !== NaN, so identity-self check via !== for sanity.
const nan: number = s.charCodeAt(99);
console.log(nan !== nan);  // true

const neg: number = s.charCodeAt(-1);
console.log(neg !== neg);  // true

// --- slice: both bounds inside range ---
const a: string = s.slice(1, 4);
console.log(a);          // ell
console.log(a.length);   // 3

// --- slice: start only ---
const b: string = s.slice(2);
console.log(b);          // llo
console.log(b.length);   // 3

// --- slice: no args ---
const c: string = s.slice();
console.log(c);          // hello
console.log(c.length);   // 5

// --- slice: negative start ---
const d: string = s.slice(-2);
console.log(d);          // lo

// --- slice: negative end ---
const e: string = s.slice(0, -1);
console.log(e);          // hell

// --- slice: negative start + negative end ---
const f: string = s.slice(-3, -1);
console.log(f);          // ll

// --- slice: start > end clamps empty ---
const g: string = s.slice(3, 1);
console.log(g.length);   // 0
console.log(g === "");   // true

// --- slice: out-of-range clamps to len ---
const h: string = s.slice(3, 99);
console.log(h);          // lo

// --- slice: empty source stays empty ---
const empty: string = "";
const e2: string = empty.slice(0, 5);
console.log(e2.length);  // 0

// --- result is independent of source (immutable string, no aliasing surprises) ---
const t: string = "abcdef";
const u: string = t.slice(1, 4);
console.log(u);          // bcd
console.log(t.length);   // 6 (source unchanged)
console.log(u + t);      // bcdabcdef

// --- chained calls ---
const v: string = "racecar";
console.log(v.slice(1).slice(0, 3));  // ace

// --- charCodeAt on result of slice ---
const w: string = s.slice(1, 4);  // "ell"
console.log(w.charCodeAt(0));  // 101 (e)

// --- string from template literal works as receiver ---
const name: string = "wo";
const tpl: string = `${name}rld`;
console.log(tpl.charCodeAt(0));  // 119 (w)
console.log(tpl.slice(2));        // rld

// --- function argument receiver (snapshot once) ---
function firstByte(input: string): number {
  return input.charCodeAt(0);
}
console.log(firstByte("zoo"));   // 122 (z)

// --- slice in loop (Lexer-style use case: token text extraction) ---
const src: string = "abcdef";
let i: number = 0;
let pieces: string = "";
while (i < src.length) {
  pieces = pieces + src.slice(i, i + 1);
  i = i + 1;
}
console.log(pieces);  // abcdef

// --- indexOf: ASCII byte search ---
const haystack: string = "banana";
console.log(haystack.indexOf("ba"));  // 0
console.log(haystack.indexOf("na"));  // 2
console.log(haystack.indexOf("zz"));  // -1
console.log(haystack.indexOf(""));    // 0
console.log(haystack.indexOf("an"));  // 1 (first repeated occurrence)
