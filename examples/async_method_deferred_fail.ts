class AsyncBox {
  async value(): Promise<number> {
    plusOne(await Promise.resolve(1));
    return 2;
  }
}

function plusOne(n: number): number {
  return n + 1;
}

const box = new AsyncBox();
console.log(box.value());
