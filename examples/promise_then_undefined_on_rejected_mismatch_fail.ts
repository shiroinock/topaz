/// <reference lib="es2015.promise" />

class UndefinedThenErr {}

const source: Promise<number> = Promise.reject(new UndefinedThenErr());
source.then(undefined, (e: unknown): string => "bad");
