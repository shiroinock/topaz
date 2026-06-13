/// <reference lib="es2018.promise" />

class ThenableCleanup {
  then(): void {}
}

Promise.resolve(1).finally((): ThenableCleanup => new ThenableCleanup());
console.log("bad");
