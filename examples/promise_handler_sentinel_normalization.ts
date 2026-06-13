/// <reference lib="es2018.promise" />

class Boom {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

const fulfilled: Promise<number> = Promise.resolve(7);
const rejected: Promise<number> = Promise.reject(new Boom("boom"));

fulfilled.then(undefined).then((value: number): void => console.log(value));
fulfilled.then(null).then((value: number): void => console.log(value + 1));
fulfilled.then(null, undefined).then((value: number): void => console.log(value + 2));
fulfilled.then(undefined, null).then((value: number): void => console.log(value + 3));
fulfilled.then(null, null).then((value: number): void => console.log(value + 4));
fulfilled.then((value: number): number => value + 5, null).then((value: number): void => console.log(value));
rejected.then(null, (err: unknown): number => 13).then((value: number): void => console.log(value));
fulfilled.catch(null).then((value: number): void => console.log(value + 7));
fulfilled.finally(null).then((value: number): void => console.log(value + 8));
