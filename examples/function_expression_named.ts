const base: number = 10;

const inc: (n: number) => number = function namedInc(n: number): number {
  return n + 1;
};

const addBase: (n: number) => number = function namedAddBase(n: number): number {
  return n + base;
};

function applyTwice(f: (n: number) => number, value: number): number {
  return f(f(value));
}

console.log(inc(3));
console.log(addBase(5));
console.log(applyTwice(function callbackStep(n: number): number {
  return n + 2;
}, 1));
