export function arrayOf<Value>(length: number, values: Value): Value[] {
  return new Array<Value>(length).fill(values);
}
