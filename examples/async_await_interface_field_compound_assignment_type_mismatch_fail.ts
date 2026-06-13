/// <reference lib="es2015.promise" />

interface InterfaceCounterTypeFail {
  saved: number;
}

class InterfaceCounterTypeFailBox implements InterfaceCounterTypeFail {
  saved: number = 0;
}

async function answer(): Promise<number> {
  const counter: InterfaceCounterTypeFail = new InterfaceCounterTypeFailBox();
  counter.saved += await Promise.resolve("bad");
  return counter.saved;
}

answer();
