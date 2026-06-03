function classify(n: number): number {
  switch (n) {
    case 1:
      {
        if (n > 0) {
          return 10;
        } else {
          return 20;
        }
      }
    case 2:
      {
        return 30;
      }
    default:
      return 99;
  }
}

console.log(classify(1));
console.log(classify(2));
console.log(classify(3));
