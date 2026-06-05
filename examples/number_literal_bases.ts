// Hex and binary integer literals lower to valid decimal C number literals.

const hexLower: number = 0x22;
const hexUpper: number = 0X10;
const binLower: number = 0b1010;
const binUpper: number = 0B11;

const total: number = hexLower + hexUpper + binLower + binUpper;
const product: number = 0b1010 * 0X10;

console.log(hexLower);
console.log(hexUpper);
console.log(binLower);
console.log(binUpper);
console.log(total);
console.log(product);
console.log(total === 63);
console.log(product > 100);
