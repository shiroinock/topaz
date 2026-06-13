/// <reference lib="es2018.promise" />

class PlainCleanup {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

Promise.resolve(1).finally((): PlainCleanup => new PlainCleanup(1));
console.log("bad");
