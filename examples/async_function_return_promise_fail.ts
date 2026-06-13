async function nested(): Promise<number> {
  return Promise.resolve(1);
}

console.log(nested());
