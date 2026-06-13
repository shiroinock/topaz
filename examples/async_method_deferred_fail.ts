class AsyncBox {
  async value(): Promise<number> {
    return plusOne(await Promise.resolve(1));
  }
}

function plusOne(n: number): number {
  return n + 1;
}

const box = new AsyncBox();
console.log(box.value());
