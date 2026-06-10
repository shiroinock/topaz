const largeA: bigint = 123456789012345678901234567890n;
const largeB: bigint = 123456789012345678901234567890n;
const largeC: bigint = 123456789012345678901234567891n;

console.log(1n === 1n);
console.log(1n !== 2n);
console.log(-55n === -55n);
console.log(largeA === largeB);
console.log(largeA !== largeC);
console.log((5n - 5n) === 0n);
console.log((largeA + 10n) !== largeB);
