let i: number = 0;
while (i < 1) {
  switch (1) {
    case 1:
      try {
        continue;
      } finally {
        i = i + 1;
      }
      continue;
  }
}
