declare const FieldKey: unique symbol;

interface Box {
  readonly [FieldKey]: string;
}

type BoxValue = Box;
