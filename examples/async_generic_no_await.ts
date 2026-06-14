/// <reference lib="es2015.promise" />

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  read(): number {
    return this.value;
  }
}

async function id<T>(value: T): Promise<T> {
  console.log("id body");
  return value;
}

async function pickSecond<A, B>(first: A, second: B): Promise<B> {
  console.log("pick body");
  return second;
}

id<number>(42).then((value: number): void => {
  console.log("then number");
  console.log(value);
});

id("ready").then((value: string): void => {
  console.log("then string");
  console.log(value);
});

id<boolean>(true).then((value: boolean): void => {
  console.log("then boolean");
  console.log(value);
});

id<Box>(new Box(7)).then((box: Box): void => {
  console.log("then box");
  console.log(box.read());
});

pickSecond<string, number>("ignored", 99).then((value: number): void => {
  console.log("then explicit second");
  console.log(value);
});

pickSecond(false, "inferred").then((value: string): void => {
  console.log("then inferred second");
  console.log(value);
});

console.log("sync tail");
