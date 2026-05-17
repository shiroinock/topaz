function classify(n: number): number {
  switch (n) {
    case 0:
      return 100;
    case 1:
    case 2:
    case 3:
      return 200;
    default:
      return 999;
  }
}

let total: number = 0;
for (let i: number = 0; i < 5; i = i + 1) {
  total = total + classify(i);
}
console.log(total);

let mode: number = 2;
switch (mode) {
  case 1:
    console.log(11);
    break;
  case 2:
    console.log(22);
    break;
  default:
    console.log(99);
    break;
}
