// Phase 1.5-3.5c: non-null assertion (`!`) and nullish coalescing (`??`).
// Both operate on `T | undefined` for T in {scalar, class, interface}.
class Item {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}

interface Named {
  name(): string;
}

class Tag implements Named {
  s: string;
  constructor(s: string) {
    this.s = s;
  }
  name(): string {
    return this.s;
  }
}

// --- non-null assertion (`!`) ---

// scalar (number | undefined) via Map.get
const nums: Map<string, number> = new Map<string, number>();
nums.set("a", 10);
nums.set("b", 20);
console.log(nums.get("a")!);         // 10
console.log(nums.get("b")! + 5);     // 25

// scalar via explicit binding (no map). `!` after narrowing is rejected,
// but `!` on an unnarrowed binding is the standard usage.
const maybeFlag: boolean | undefined = true;
console.log(maybeFlag!);              // true

// class (Item | undefined) via Map.get
const items: Map<string, Item> = new Map<string, Item>();
items.set("x", new Item(7));
console.log(items.get("x")!.v);       // 7

// interface (Named | undefined) via Map.get
const named: Map<number, Named> = new Map<number, Named>();
named.set(1, new Tag("alpha"));
console.log(named.get(1)!.name());    // alpha

// --- nullish coalescing (`??`) ---

// scalar fallback
console.log(nums.get("a") ?? -1);     // 10
console.log(nums.get("missing") ?? -1);   // -1
console.log(nums.get("b") ?? 0);      // 20

// chained: ?? + arithmetic
const sum: number = (nums.get("a") ?? 0) + (nums.get("missing") ?? 100);
console.log(sum);                     // 110

// class fallback (new instance)
const fallback1: Item = items.get("x") ?? new Item(99);
console.log(fallback1.v);             // 7
const fallback2: Item = items.get("missing") ?? new Item(99);
console.log(fallback2.v);             // 99

// interface fallback with class -> iface coercion at the RHS
const named1: Named = named.get(1) ?? new Tag("default");
console.log(named1.name());           // alpha
const named2: Named = named.get(2) ?? new Tag("default");
console.log(named2.name());           // default

// string scalar
const labels: Map<number, string> = new Map<number, string>();
labels.set(1, "hello");
console.log(labels.get(1) ?? "?");    // hello
console.log(labels.get(2) ?? "?");    // ?

// Chained `??` is fine — each layer narrows one `T | undefined` to T.
console.log(nums.get("missing") ?? nums.get("b") ?? -1);   // 20
console.log(nums.get("x") ?? nums.get("y") ?? -1);         // -1

// `!` then arithmetic inside a function
function getOrAbort(m: Map<string, number>, k: string): number {
  return m.get(k)! * 2;
}
console.log(getOrAbort(nums, "a"));   // 20
