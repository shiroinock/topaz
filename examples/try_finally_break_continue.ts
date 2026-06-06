let i: number = 0;
let acc: number = 0;
while (i < 5) {
  i = i + 1;
  try {
    if (i === 2) {
      continue;
    }
    if (i === 4) {
      break;
    }
    acc = acc + i;
    console.log(i);
  } finally {
    console.log(100 + i);
  }
  console.log(200 + i);
}
console.log(acc);

let d: number = 0;
do {
  d = d + 1;
  try {
    if (d === 1) {
      continue;
    }
    if (d === 3) {
      break;
    }
    console.log(300 + d);
  } finally {
    console.log(400 + d);
  }
  console.log(500 + d);
} while (d < 5);

let f: number = 0;
for (let j: number = 0; j < 4; j = j + 1) {
  try {
    if (j === 1) {
      continue;
    }
    if (j === 3) {
      break;
    }
    f = f + 10 + j;
  } finally {
    f = f + 100;
  }
}
console.log(f);

let total: number = 0;
for (const x of [1, 2, 3, 4]) {
  try {
    if (x === 2) {
      continue;
    }
    if (x === 4) {
      break;
    }
    total = total + x;
  } finally {
    total = total + 10;
  }
}
console.log(total);

let sw: number = 0;
switch (2) {
  case 1:
    break;
  case 2:
    try {
      sw = 20;
      break;
    } finally {
      sw = sw + 1;
    }
    break;
  default:
    sw = 99;
    break;
}
console.log(sw);
