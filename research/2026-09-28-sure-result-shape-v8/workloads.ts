/*
Paired workloads for two result shapes:

- tuple: `readonly [true, T] | readonly [false, E]`, as `@samebase/sure` returns it.
- object: `{ ok: true, value } | { ok: false, error }`, as Evolu returns it.

Each pair runs the same logic on the same inputs. Only the result shape and the way the caller
reads it differ. `bench.ts` runs one variant per process, so V8 feedback from one variant never
reaches the other.
*/
import * as sure from "../../packages/sure/src/index.ts";

type Tuple<T, E> = readonly [true, T] | readonly [false, E];

function good<T>(value: T): readonly [true, T] {
  return [true, value];
}

function bad<E>(error: E): readonly [false, E] {
  return [false, error];
}

type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

function err<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}

/*
Written by every schema variant, so optimized code cannot drop the validated values.
*/
let sink: unknown;

export function readSink(): unknown {
  return sink;
}

/*
Deterministic inputs, so every variant and every process sees the same data.
*/
function random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INPUT_COUNT = 4096;
const RECORD_COUNT = 1024;

function numberInputs(failRate: number): unknown[] {
  const next = random(1);
  const inputs: unknown[] = [];

  for (let i = 0; i < INPUT_COUNT; i++) {
    inputs.push(next() < failRate ? `n${i}` : Math.floor(next() * 1000));
  }

  return inputs;
}

/*
Failures are spread over the three chain steps: not a number, out of range, not an integer.
*/
function chainInputs(failRate: number): unknown[] {
  const next = random(2);
  const inputs: unknown[] = [];

  for (let i = 0; i < INPUT_COUNT; i++) {
    if (next() < failRate) {
      const step = Math.floor(next() * 3);
      inputs.push(step === 0 ? `n${i}` : step === 1 ? 5000 + i : i + 0.5);
    } else {
      inputs.push(Math.floor(next() * 1000));
    }
  }

  return inputs;
}

function makeRecord(id: unknown, name: unknown, age: unknown, tags: unknown) {
  return { id, name, age, tags };
}

/*
An invalid record has exactly one bad field. A bad `tags` field has one bad element.
*/
function recordInputs(failRate: number): unknown[] {
  const next = random(3);
  const records: unknown[] = [];

  for (let i = 0; i < RECORD_COUNT; i++) {
    const tags = ["a", "b", "c"].slice(0, Math.floor(next() * 4));
    const age = Math.floor(next() * 100);

    if (next() < failRate) {
      const field = Math.floor(next() * 4);
      records.push(
        makeRecord(
          field === 0 ? i : `u${i}`,
          field === 1 ? null : `name${i}`,
          field === 2 ? String(age) : age,
          field === 3 ? ["a", 2] : tags,
        ),
      );
    } else {
      records.push(makeRecord(`u${i}`, `name${i}`, age, tags));
    }
  }

  return records;
}

/*
Validators shared by the workloads. They differ only in the result shape.
*/
function tupleNumber(x: unknown): Tuple<number, string> {
  return typeof x === "number" ? good(x) : bad("not number");
}

function objectNumber(x: unknown): Result<number, string> {
  return typeof x === "number" ? ok(x) : err("not number");
}

function tupleRange(n: number): Tuple<number, string> {
  return n >= 0 && n <= 1000 ? good(n) : bad("out of range");
}

function objectRange(n: number): Result<number, string> {
  return n >= 0 && n <= 1000 ? ok(n) : err("out of range");
}

function tupleInteger(n: number): Tuple<number, string> {
  return Number.isInteger(n) ? good(n) : bad("not integer");
}

function objectInteger(n: number): Result<number, string> {
  return Number.isInteger(n) ? ok(n) : err("not integer");
}

/*
Idiomatic tuple code: destructure each step, then wrap the error again with `bad`.
*/
function tupleChain(x: unknown): Tuple<number, string> {
  const [isNumber, number] = tupleNumber(x);
  if (!isNumber) return bad(number);

  const [inRange, ranged] = tupleRange(number);
  if (!inRange) return bad(ranged);

  return tupleInteger(ranged);
}

/*
Tuple code without destructuring: pass the failed tuple through, as the object code does.
*/
function tupleIndexChain(x: unknown): Tuple<number, string> {
  const number = tupleNumber(x);
  if (!number[0]) return number;

  const ranged = tupleRange(number[1]);
  if (!ranged[0]) return ranged;

  return tupleInteger(ranged[1]);
}

function objectChain(x: unknown): Result<number, string> {
  const number = objectNumber(x);
  if (!number.ok) return number;

  const ranged = objectRange(number.value);
  if (!ranged.ok) return ranged;

  return objectInteger(ranged.value);
}

/*
Minimal copies of the Sure `object` and `array` combinators, one per shape.
Errors keep the Sure layout: a key map for objects, a positional list for arrays.
*/
type TupleValidator = (x: unknown) => Tuple<unknown, unknown>;
type ObjectValidator = (x: unknown) => Result<unknown, unknown>;

function tupleString(x: unknown): Tuple<string, string> {
  return typeof x === "string" ? good(x) : bad("not string");
}

function objectString(x: unknown): Result<string, string> {
  return typeof x === "string" ? ok(x) : err("not string");
}

function tupleArray(item: TupleValidator): TupleValidator {
  return (x) => {
    if (!Array.isArray(x)) return bad([]);

    let failed = false;
    const goods: unknown[] = [];
    const bads: unknown[] = [];

    for (const element of x) {
      const [valid, value] = item(element);

      if (valid) {
        goods.push(value);
        bads.push(undefined);
      } else {
        bads.push(value);
        failed = true;
      }
    }

    return failed ? bad(bads) : good(goods);
  };
}

function objectArray(item: ObjectValidator): ObjectValidator {
  return (x) => {
    if (!Array.isArray(x)) return err([]);

    let failed = false;
    const goods: unknown[] = [];
    const bads: unknown[] = [];

    for (const element of x) {
      const result = item(element);

      if (result.ok) {
        goods.push(result.value);
        bads.push(undefined);
      } else {
        bads.push(result.error);
        failed = true;
      }
    }

    return failed ? err(bads) : ok(goods);
  };
}

function tupleObject(shape: Record<string, TupleValidator>): TupleValidator {
  const fields = Object.entries(shape).map(([key, validate]) => ({ key, validate }));

  return (x) => {
    if (typeof x !== "object" || x === null) return bad({});

    let failed = false;
    const goods: Record<string, unknown> = {};
    const bads: Record<string, unknown> = {};

    for (const field of fields) {
      // @ts-expect-error `x` is a non-null object, so a string key reads an unknown value
      const [valid, value] = field.validate(x[field.key]);

      if (valid) {
        goods[field.key] = value;
      } else {
        bads[field.key] = value;
        failed = true;
      }
    }

    return failed ? bad(bads) : good(goods);
  };
}

function objectObject(shape: Record<string, ObjectValidator>): ObjectValidator {
  const fields = Object.entries(shape).map(([key, validate]) => ({ key, validate }));

  return (x) => {
    if (typeof x !== "object" || x === null) return err({});

    let failed = false;
    const goods: Record<string, unknown> = {};
    const bads: Record<string, unknown> = {};

    for (const field of fields) {
      // @ts-expect-error `x` is a non-null object, so a string key reads an unknown value
      const result = field.validate(x[field.key]);

      if (result.ok) {
        goods[field.key] = result.value;
      } else {
        bads[field.key] = result.error;
        failed = true;
      }
    }

    return failed ? err(bads) : ok(goods);
  };
}

/*
A variant receives the inputs once and returns the step that `bench.ts` times.
Each step processes every input once and returns a checksum.
*/
type Variant = (inputs: unknown[]) => () => number;

export type Workload = {
  readonly description: string;
  readonly inputs: (failRate: number) => unknown[];
  readonly variants: Readonly<Record<string, Variant>>;
};

export const workloads: Readonly<Record<string, Workload>> = {
  parse: {
    description: "One validator per input. The caller reads the result at once.",
    inputs: numberInputs,
    variants: {
      tuple: (inputs) => () => {
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
          const [valid, value] = tupleNumber(inputs[i]);
          sum += valid ? value : value.length;
        }
        return sum;
      },
      "tuple-index": (inputs) => () => {
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
          const result = tupleNumber(inputs[i]);
          sum += result[0] ? result[1] : result[1].length;
        }
        return sum;
      },
      object: (inputs) => () => {
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
          const result = objectNumber(inputs[i]);
          sum += result.ok ? result.value : result.error.length;
        }
        return sum;
      },
    },
  },

  store: {
    description: "One validator per input. The results go into an array and are read later.",
    inputs: numberInputs,
    variants: {
      tuple: (inputs) => {
        const results = inputs.map(tupleNumber);
        return () => {
          for (let i = 0; i < inputs.length; i++) results[i] = tupleNumber(inputs[i]);
          let sum = 0;
          for (const result of results) {
            const [valid, value] = result;
            sum += valid ? value : value.length;
          }
          return sum;
        };
      },
      "tuple-index": (inputs) => {
        const results = inputs.map(tupleNumber);
        return () => {
          for (let i = 0; i < inputs.length; i++) results[i] = tupleNumber(inputs[i]);
          let sum = 0;
          for (const result of results) sum += result[0] ? result[1] : result[1].length;
          return sum;
        };
      },
      object: (inputs) => {
        const results = inputs.map(objectNumber);
        return () => {
          for (let i = 0; i < inputs.length; i++) results[i] = objectNumber(inputs[i]);
          let sum = 0;
          for (const result of results) sum += result.ok ? result.value : result.error.length;
          return sum;
        };
      },
    },
  },

  chain: {
    description: "Three validators in sequence. A failure stops the chain.",
    inputs: chainInputs,
    variants: {
      tuple: (inputs) => () => {
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
          const [valid, value] = tupleChain(inputs[i]);
          sum += valid ? value : value.length;
        }
        return sum;
      },
      "tuple-index": (inputs) => () => {
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
          const result = tupleIndexChain(inputs[i]);
          sum += result[0] ? result[1] : result[1].length;
        }
        return sum;
      },
      object: (inputs) => () => {
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
          const result = objectChain(inputs[i]);
          sum += result.ok ? result.value : result.error.length;
        }
        return sum;
      },
    },
  },

  schema: {
    description: "A record with 4 fields, one of them an array, as a Sure object schema.",
    inputs: recordInputs,
    variants: {
      tuple: (inputs) => {
        const record = tupleObject({
          id: tupleString,
          name: tupleString,
          age: tupleNumber,
          tags: tupleArray(tupleString),
        });
        return () => {
          let sum = 0;
          for (let i = 0; i < inputs.length; i++) {
            const [valid, value] = record(inputs[i]);
            sink = value;
            sum += valid ? 1 : 2;
          }
          return sum;
        };
      },
      object: (inputs) => {
        const record = objectObject({
          id: objectString,
          name: objectString,
          age: objectNumber,
          tags: objectArray(objectString),
        });
        return () => {
          let sum = 0;
          for (let i = 0; i < inputs.length; i++) {
            const result = record(inputs[i]);
            sink = result.ok ? result.value : result.error;
            sum += result.ok ? 1 : 2;
          }
          return sum;
        };
      },
      sure: (inputs) => {
        const record = sure.object({
          id: sure.string,
          name: sure.string,
          age: sure.number,
          tags: sure.array(sure.string),
        });
        return () => {
          let sum = 0;
          for (let i = 0; i < inputs.length; i++) {
            const [valid, value] = record(inputs[i]);
            sink = value;
            sum += valid ? 1 : 2;
          }
          return sum;
        };
      },
    },
  },
};

/*
Results that `size.ts` keeps alive to measure their heap size.
*/
export const sizeCases: Readonly<Record<string, (i: number) => unknown>> = {
  "tuple good": (i) => good(i),
  "tuple bad": () => bad("not number"),
  "object ok": (i) => ok(i),
  "object err": () => err("not number"),
  "sure good": (i) => sure.good(i),
};
