/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;

class LikeBox {
  current: NumberLike;

  constructor(current: NumberLike) {
    this.current = current;
  }
}

async function read(box: LikeBox): Promise<number> {
  const current: NumberLike = box.current;
  const value = await current;
  return value;
}
