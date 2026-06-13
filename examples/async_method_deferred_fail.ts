class AsyncBox {
  async value(): Promise<number> {
    return await Promise.resolve(1);
  }
}

const box = new AsyncBox();
console.log(box.value());
