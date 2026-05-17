let m: Map<string, number> = new Map<string, number>();
m.set("alpha", 1);
m.set("beta", 2);
m.set("gamma", 3);
console.log(m.size);
console.log(m.get("beta"));
console.log(m.has("alpha"));
console.log(m.has("delta"));

m.set("alpha", 10);
console.log(m.get("alpha"));

let removed: boolean = m.delete("beta");
console.log(removed);
console.log(m.size);
console.log(m.has("beta"));

let s: Set<number> = new Set<number>();
s.add(1);
s.add(2);
s.add(2);
s.add(3);
console.log(s.size);
console.log(s.has(2));
console.log(s.has(99));

let removed2: boolean = s.delete(2);
console.log(removed2);
console.log(s.size);
console.log(s.has(2));

let bm: Map<boolean, string> = new Map<boolean, string>();
bm.set(true, "yes");
bm.set(false, "no");
console.log(bm.get(true));
console.log(bm.get(false));

let ns: Set<string> = new Set<string>();
ns.add("a");
ns.add("b");
ns.add("a");
console.log(ns.size);
let removed3: boolean = ns.delete("a");
console.log(removed3);
console.log(ns.has("a"));
console.log(ns.has("b"));

let big: Map<number, number> = new Map<number, number>();
for (let i: number = 0; i < 50; i++) {
  big.set(i, i * 10);
}
console.log(big.size);
console.log(big.get(25));
console.log(big.get(49));

let inferred: Map<string, number> = new Map();
inferred.set("x", 7);
console.log(inferred.get("x"));
