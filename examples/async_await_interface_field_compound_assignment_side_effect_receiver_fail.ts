/// <reference lib="es2015.promise" />

interface InterfaceCounterFail {
  saved: number;
}

class InterfaceCounterFailBox implements InterfaceCounterFail {
  saved: number = 0;
}

function makeCounter(): InterfaceCounterFail {
  return new InterfaceCounterFailBox();
}

async function answer(): Promise<number> {
  makeCounter().saved += await Promise.resolve(1);
  return 0;
}

answer();
