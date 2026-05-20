// Phase 1.5-3c: Map.get returns V | undefined for every V kind (scalar,
// class, interface). Each branch must narrow before use.
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

const nums: Map<string, number> = new Map<string, number>();
nums.set("a", 10);
nums.set("b", 20);
const n1: number | undefined = nums.get("a");
if (n1 !== undefined) {
  console.log(n1);
} else {
  console.log(-1);
}
const n2: number | undefined = nums.get("missing");
if (n2 !== undefined) {
  console.log(n2);
} else {
  console.log(-1);
}

const items: Map<string, Item> = new Map<string, Item>();
items.set("x", new Item(7));
const i1: Item | undefined = items.get("x");
if (i1 !== undefined) {
  console.log(i1.v);
}
const i2: Item | undefined = items.get("none");
if (i2 === undefined) {
  console.log(0);
}

const named: Map<number, Named> = new Map<number, Named>();
named.set(1, new Tag("alpha"));
const nm1: Named | undefined = named.get(1);
if (nm1 !== undefined) {
  console.log(nm1.name());
}
const nm2: Named | undefined = named.get(99);
if (nm2 === undefined) {
  console.log("absent");
}

// Early-return narrowing across the function boundary.
function takeNum(m: Map<string, number>, k: string): number {
  const v: number | undefined = m.get(k);
  if (v === undefined) {
    return -777;
  }
  return v + 1;
}
console.log(takeNum(nums, "b"));
console.log(takeNum(nums, "ghost"));
