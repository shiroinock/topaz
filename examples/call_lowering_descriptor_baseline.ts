/// <reference lib="es2015.promise" />

function add(a: number, b: number): number {
  return a + b;
}

function identity<T>(value: T): T {
  return value;
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

const bump: (n: number) => number = (n: number): number => n + 3;

class DescriptorBox {
  base: number = 0;
  label: string = "";

  constructor(base: number, label: string) {
    this.base = base;
    this.label = label;
  }

  value(delta: number): number {
    console.log(this.label);
    return this.base + delta;
  }
}

interface DescriptorFace {
  value(delta: number): number;
}

class DescriptorImpl implements DescriptorFace {
  base: number = 0;
  label: string = "";

  constructor(base: number, label: string) {
    this.base = base;
    this.label = label;
  }

  value(delta: number): number {
    console.log(this.label);
    return this.base + delta;
  }
}

async function asyncPlan(): Promise<number> {
  const value = add(mark("async pre", 10), await Promise.resolve(2));
  console.log("async read");
  console.log(value);
  return value;
}

console.log("bare call");
console.log(add(1, 2));
console.log("generic call");
console.log(identity<number>(4));
console.log("fn value call");
console.log(bump(5));
console.log("class method call");
console.log(new DescriptorBox(10, "class method body").value(2));

const face: DescriptorFace = new DescriptorImpl(20, "interface method body");
console.log("interface method call");
console.log(face.value(3));

asyncPlan().then((n: number): void => {
  console.log("async then");
  console.log(n);
});

console.log("sync tail");
