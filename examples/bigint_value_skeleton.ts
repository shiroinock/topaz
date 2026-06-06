const a: bigint = 123n;
let b: bigint = 999999999999999999999999999999999999n;
b = 42n;

function id(x: bigint): bigint {
  return x;
}

class Box {
  value: bigint;

  constructor(value: bigint) {
    this.value = value;
  }
}

const boxed = new Box(id(b));
const c: bigint = boxed.value;
