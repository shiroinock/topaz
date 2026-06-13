/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;

const values: Map<NumberLike, number> = new Map<NumberLike, number>();
console.log("bad");
