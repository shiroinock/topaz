Promise.resolve(1).finally((): void => {
  console.log("cleanup");
});
console.log("bad");
