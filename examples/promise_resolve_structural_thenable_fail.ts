/// <reference lib="es2018.promise" />

class StructuralThenable {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  then(): void {
    console.log("not assimilated");
  }
}

const value: Promise<number> = Promise.resolve(new StructuralThenable(1));
console.log("bad");
