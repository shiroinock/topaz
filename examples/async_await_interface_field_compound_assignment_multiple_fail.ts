/// <reference lib="es2015.promise" />

interface InterfaceCounterMultipleFail {
  saved: number;
}

class InterfaceCounterMultipleFailBox implements InterfaceCounterMultipleFail {
  saved: number = 0;
}

async function answer(): Promise<number> {
  const counter: InterfaceCounterMultipleFail = new InterfaceCounterMultipleFailBox();
  counter.saved += (await Promise.resolve(1)) + (await Promise.resolve(2));
  return counter.saved;
}

answer();
