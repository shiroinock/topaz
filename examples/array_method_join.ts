// Phase 1.5-3.5f-join: Array.join. Per-monomorph `topaz_array_<src>_join`
// helper emitted by codegen (does NOT pollute TOPAZ_ARRAY_DEFINE). 2-pass:
// stringify each element while accumulating length, alloc once from arena,
// then write. Default separator = ",".

// --- number elem, default separator ---
const ns: Array<number> = [1, 2, 3];
const s1: string = ns.join();
console.log(s1);  // 1,2,3
console.log(s1.length);  // 5

// --- number elem, explicit separator ---
const s2: string = ns.join(", ");
console.log(s2);  // 1, 2, 3
console.log(s2.length);  // 7

// --- empty separator concatenates ---
const s3: string = ns.join("");
console.log(s3);  // 123
console.log(s3.length);  // 3

// --- multi-char separator ---
const s4: string = ns.join(" -> ");
console.log(s4);  // 1 -> 2 -> 3

// --- string elem ---
const words: Array<string> = ["alpha", "beta", "gamma"];
const w1: string = words.join("-");
console.log(w1);  // alpha-beta-gamma
const w2: string = words.join();
console.log(w2);  // alpha,beta,gamma

// --- boolean elem ---
const bs: Array<boolean> = [true, false, true];
const b1: string = bs.join();
console.log(b1);  // true,false,true
const b2: string = bs.join(" | ");
console.log(b2);  // true | false | true

// --- empty array ---
const empty: Array<number> = [];
const e1: string = empty.join();
console.log(e1);  // (empty line)
console.log(e1.length);  // 0
const e2: string = empty.join("anything");
console.log(e2.length);  // 0 — separator irrelevant for empty

// --- single-element array (no separator placed) ---
const one: Array<number> = [42];
const o1: string = one.join(",");
console.log(o1);  // 42
console.log(o1.length);  // 2

// --- ECMA-262 number formatting (uses topaz_number_to_string) ---
const formatted: Array<number> = [3.14, 0, -1.5];
const f1: string = formatted.join(",");
console.log(f1);  // 3.14,0,-1.5

// --- .map().join() chain (transform then stringify) ---
const xs: Array<number> = [1, 2, 3];
const doubled: string = xs.map((n) => n * 2).join(",");
console.log(doubled);  // 2,4,6

// --- .filter().join() chain ---
const filtered: string = xs.filter((n) => n >= 2).join("-");
console.log(filtered);  // 2-3

// --- chained .slice().join() ---
const sliced: string = xs.slice(1).join(",");
console.log(sliced);  // 2,3

// --- captured by `+` (join result is a normal string) ---
const labelled: string = "[" + ns.join(",") + "]";
console.log(labelled);  // [1,2,3]

// --- multiple calls share the same per-monomorph helper ---
const ns2: Array<number> = [10, 20];
console.log(ns.join(":"));  // 1:2:3
console.log(ns2.join(":"));  // 10:20
