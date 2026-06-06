function f(): number {
  try {
    try {
      return 1;
    } finally {
      console.log("inner");
    }
  } finally {
    console.log("outer");
  }
}

console.log(f());
