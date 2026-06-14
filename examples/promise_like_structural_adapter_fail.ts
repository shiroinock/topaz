/// <reference lib="es2018.promise" />

class ThenableNumber {
  then<TResult1, TResult2>(
    onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    throw new Error("not called");
  }
}

const value: PromiseLike<number> = new ThenableNumber();
console.log(value);
