/// <reference lib="es2015.promise" />

interface UnsafeInterfaceCounterMultiple {
  saved: number;
}

class UnsafeInterfaceCounterMultipleBox implements UnsafeInterfaceCounterMultiple {
  saved: number = 0;
}

function makeCounter(): UnsafeInterfaceCounterMultiple {
  return new UnsafeInterfaceCounterMultipleBox();
}

async function answer(): Promise<number> {
  return (makeCounter().saved += (await Promise.resolve(1)) + (await Promise.resolve(2)));
}

answer();
