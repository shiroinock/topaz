// Phase 1.5-6i prep: expression-bodied arrows with typed parameters infer
// their return type when no contextual function type is available.

function callNumber(fn: (n: number) => void, n: number): void {
  fn(n);
}

const inc = (n: number) => n + 1;
console.log(inc(41));

const tag = (s: string) => "x" + s;
console.log(tag("topaz"));

const log = (s: string) => console.log(s);
log("void-body");

const logNumber = (n: number) => console.log(n);
const call = (fn: (n: number) => void, n: number) => fn(n);
call(logNumber, 7);
callNumber(logNumber, 9);
