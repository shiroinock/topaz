function f(): number {
  try {
    return 1;
  } finally {
    console.log("cleanup");
  }
}

console.log(f());
