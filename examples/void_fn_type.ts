// Phase 1.5-6i prep: first-class fn types may return void. The call is valid
// only as an expression statement; void still has no value representation.

class Accumulator {
  total: number;
  constructor() {
    this.total = 0;
  }
  add(n: number): void {
    this.total = this.total + n;
  }
}

function callNumber(fn: (n: number) => void, n: number): void {
  fn(n);
}

function withVoid(fn: () => void): void {
  fn();
}

const printNumber: (n: number) => void = (n): void => {
  console.log(n);
  return;
};

callNumber(printNumber, 3);

const acc = new Accumulator();
const addToAcc: (n: number) => void = (n): void => {
  acc.add(n);
};

addToAcc(4);
callNumber(addToAcc, 6);
console.log(acc.total);

withVoid((): void => {
  console.log("done");
});
