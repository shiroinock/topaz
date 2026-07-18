/// <reference lib="es2015.promise" />

interface InterfaceCounterMultiple {
  saved: number;
  setSaved(value: number): void;
}

class InterfaceCounterMultipleBox implements InterfaceCounterMultiple {
  saved: number = 10;

  setSaved(value: number): void {
    this.saved = value;
  }
}

const interfaceFirst: InterfaceCounterMultiple = new InterfaceCounterMultipleBox();
const interfaceSecond: InterfaceCounterMultiple = new InterfaceCounterMultipleBox();
let interfaceCounter: InterfaceCounterMultiple = interfaceFirst;

const interfaceLeft: () => Promise<number> = async function (): Promise<number> {
  console.log("interface left");
  interfaceFirst.setSaved(100);
  interfaceCounter = interfaceSecond;
  return 1;
};

const interfaceRight: () => Promise<number> = async function (): Promise<number> {
  console.log("interface right");
  return 2;
};

const answer: () => Promise<number> = async function (): Promise<number> {
  const result = (interfaceCounter.saved += (await interfaceLeft()) + (await interfaceRight()));
  console.log(result);
  console.log(interfaceFirst.saved);
  console.log(interfaceSecond.saved);
  return result;
};

console.log("sync tail");
answer().then((value: number): void => {
  console.log("interface then");
  console.log(value);
});
