// Phase 1.5-3.5d: optional chaining `?.`. `a?.b` / `a?.b()` / `a?.[i]` all
// short-circuit on a `T | undefined` receiver and yield `U | undefined`,
// where U is the field / method-return / element type.
class Node {
  value: number;
  label: string;
  constructor(v: number, l: string) {
    this.value = v;
    this.label = l;
  }
  describe(): string {
    return this.label;
  }
  scaled(k: number): number {
    return this.value * k;
  }
}

interface Tagged {
  weight: number;
  tag(): string;
  bump(k: number): number;
}

class Box implements Tagged {
  weight: number;
  name: string;
  constructor(w: number, n: string) {
    this.weight = w;
    this.name = n;
  }
  tag(): string {
    return this.name;
  }
  bump(k: number): number {
    this.weight = this.weight + k;
    return this.weight;
  }
}

// --- class `?.field` / `?.method()` ---

const nodes: Map<string, Node> = new Map<string, Node>();
nodes.set("a", new Node(10, "alpha"));
nodes.set("b", new Node(20, "beta"));

// `?.field` yields `T | undefined`; use `??` for the absent case.
console.log(nodes.get("a")?.value ?? -1);              // 10
console.log(nodes.get("missing")?.value ?? -1);        // -1
console.log(nodes.get("a")?.label ?? "(none)");        // alpha
console.log(nodes.get("missing")?.label ?? "(none)");  // (none)

// `?.method()` for the same Map; works with arguments too.
console.log(nodes.get("a")?.describe() ?? "(none)");   // alpha
console.log(nodes.get("missing")?.describe() ?? "(none)");  // (none)
console.log(nodes.get("a")?.scaled(3) ?? 0);           // 30
console.log(nodes.get("missing")?.scaled(3) ?? 0);     // 0

// --- interface `?.field` / `?.method()` ---

const boxes: Map<string, Tagged> = new Map<string, Tagged>();
boxes.set("hi", new Box(5, "greeting"));

// Interface field read goes through the vtable getter inside the present branch.
console.log(boxes.get("hi")?.weight ?? -1);            // 5
console.log(boxes.get("nope")?.weight ?? -1);          // -1
console.log(boxes.get("hi")?.tag() ?? "(none)");       // greeting
console.log(boxes.get("nope")?.tag() ?? "(none)");     // (none)
console.log(boxes.get("hi")?.bump(2) ?? 0);            // 7
console.log(boxes.get("nope")?.bump(2) ?? 0);          // 0

// --- `?.[i]` on Array | undefined ---

function lookupRow(key: string): Array<number> | undefined {
  if (key === "row") {
    const r: Array<number> = [];
    r.push(100);
    r.push(200);
    r.push(300);
    return r;
  }
  return undefined;
}

console.log(lookupRow("row")?.[0] ?? -1);     // 100
console.log(lookupRow("row")?.[2] ?? -1);     // 300
console.log(lookupRow("none")?.[0] ?? -1);    // -1

// --- chaining `?.` through multiple optional layers ---

class Link {
  next: Link | undefined;
  payload: number;
  constructor(p: number) {
    this.next = undefined;
    this.payload = p;
  }
}

const links: Map<string, Link> = new Map<string, Link>();
const headLink: Link = new Link(1);
headLink.next = new Link(2);
links.set("h", headLink);

// First `?.next` short-circuits if `Map.get` returns undefined (h is present,
// missing isn't); second `?.payload` short-circuits when the tail's `.next` is
// undefined.
console.log(links.get("h")?.next?.payload ?? -1);         // 2
console.log(links.get("missing")?.next?.payload ?? -1);   // -1
console.log(links.get("h")?.next?.next?.payload ?? -1);   // -1

// --- `?.` combined with `!` to assert non-absence after the chain ---

console.log(nodes.get("a")?.scaled(2)!);      // 20

// --- narrowing the optional result via `if (x !== undefined)` ---

const maybeDesc: string | undefined = nodes.get("a")?.describe();
if (maybeDesc !== undefined) {
  console.log(maybeDesc);                     // alpha
}
