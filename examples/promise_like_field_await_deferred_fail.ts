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
  return await current;
}

const box = new LikeBox(Promise.resolve(50));

read(box).then((n: number): void => {
  console.log("field then");
  console.log(n);
});

console.log("sync tail");
