class AsyncBox {
  async value(): Promise<number> {
    if (await Promise.resolve(true)) {
      return 1;
    }
    return 0;
  }
}

const box = new AsyncBox();
box.value();
