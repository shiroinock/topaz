// Phase 1.5-3.5: template literal lowering. Each ${} substitution flows
// through to_string helpers (number / boolean / string) and the whole
// expression collapses to a left-associative `topaz_string_concat` chain.

let name: string = "topaz";
let n: number = 42;
let b: boolean = true;

// Mixed substitutions.
console.log(`hello, ${name}!`);
console.log(`${name} is ${n}`);
console.log(`flag=${b}`);

// Empty head / tail / adjacent substitutions.
console.log(`${name}`);
console.log(`${name}/${n}`);
console.log(`${n}${b}`);

// Numeric formatting (must match console.log on the same number).
console.log(`pi=${3.14}`);
console.log(`sum=${0.1 + 0.2}`);
console.log(`big=${1e21}`);
console.log(`tiny=${1e-7}`);

// Expression substitutions: function call, method call, binary op.
function twice(x: number): number { return x * 2; }
console.log(`twice(${n})=${twice(n)}`);
console.log(`len(${name})=${name.length}`);
console.log(`n+1=${n + 1}`);

// Narrowed `T | undefined`: only the narrowed branch reaches the template.
function describe(x: number, label: string | undefined): string {
  if (label !== undefined) {
    return `${label}=${x}`;
  }
  return `?=${x}`;
}
console.log(describe(7, "answer"));
console.log(describe(7, undefined));

// Class field / method substitution.
class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  norm(): number {
    return this.x * this.x + this.y * this.y;
  }
}
let p: Point = new Point(3, 4);
console.log(`(${p.x}, ${p.y})`);
console.log(`norm=${p.norm()}`);

// Backslash / quote / newline in literal fragments.
console.log(`q="${name}"`);
console.log(`tab\there`);

// Repeated concatenation in a loop — exercises arena alloc per iteration.
let acc: string = "";
for (let i = 0; i < 5; i++) {
  acc = `${acc}[${i}]`;
}
console.log(acc);
