# @samebase/sure

Tiny validation primitives built around four small functions:

- `good(value)`
- `bad(error)`
- `pure(validator)`
- `sure(validator, meta)`

This package stays generic. App-specific protocols such as route search params should build their
own codecs on top of these validators instead of adding domain concepts here.

## Validation errors

Built-in validators return a flat array of issues on failure. Each issue has a `path` and an
unrestricted `error` payload. Object fields add string keys to the path; arrays and tuples add
numeric indexes. An empty path refers to the input itself.

```ts
const person = object({ name: string, scores: array(number) });

person({ name: null, scores: [10, "bad"] });
// [false, [
//   { path: ["name"], error: "not string" },
//   { path: ["scores", 1], error: "not number" },
// ]]
```

Use `fail(error)` for a custom validation failure. It returns `bad([{ path: [], error }])`. The
error can be a string, `undefined`, an object, an array, or any other value. An array passed to
`fail` remains one error payload; it is never flattened.

```ts
const positive = after(number, (value) => (value > 0 ? good(value) : fail("not positive")));
const schema = object({ age: positive });

// To return several issues, construct the list explicitly:
const failure = bad([
  { path: ["name"], error: "missing" },
  { path: ["age"], error: undefined },
]);
```

`bad(error)` and `Unsure<Error, Value>` remain generic result helpers. They do not wrap or interpret
their payloads. `after`, `union`, `intersection`, and `optional` also preserve the error they
receive. Collections (`object`, `array`, `tuple`, and `recurse`) require child failures to be issue
arrays, so a custom field validator that returns `bad("invalid")` must change to `fail("invalid")`.

This changes built-in validation errors from nested objects or positional arrays to issue lists.
`InferBad` describes the whole issue array. A wrong outer shape produces a root issue with
`"not object"`, `"not array"`, or `"not tuple"`. A child that returns `bad([])` still causes
failure. `err` throws the issue array. Standard Schema integration is not included.

## Promise support

A validator can return its tuple directly or return a Promise of that tuple. `pure` and `sure`
preserve the callback's return type. Composite validators wait for each child before they use its
result. Synchronous validation does not create a Promise.

```ts
const asyncNumber = pure((value) => Promise.resolve(number(value)));
const person = object({ name: string, age: asyncNumber });

const result = await person({ name: "Ada", age: 37 });
// [true, { name: "Ada", age: 37 }]
```

For type annotations, `Sure<Error, Value, Input, Meta, Async>` defaults `Async` to `false`:

- `false`: returns `Unsure<Error, Value>`.
- `true`: returns `Promise<Unsure<Error, Value>>`.
- `boolean`: can return either.

Composite validators with async children use the third case. An invalid outer value, an empty array,
an absent optional field, or an earlier branch can skip the async child. The runtime cannot read a
function's TypeScript return type to detect this in advance. Use `await` when a schema can run async
work. To guarantee a Promise at a boundary, use an `async` wrapper there.

Children run in order. Objects, arrays, and tuples still collect all validation errors. `after`,
`union`, and `intersection` keep their early-return rules. A rejected Promise stays rejected; it is
not converted to a `bad` result. `err` throws a synchronous bad result or rejects with an async bad
result.

Only a Promise around the result tuple makes validation async. Payloads stay unchanged, including
`undefined`, `null`, `false`, Promises, and thenable objects. `good(undefined)` and `bad(undefined)`
remain distinct outcomes. A Promise stored inside `good(...)` is data and does not make the
validator itself async.

`err` removes the tuple. Like a native async function, an async `err` also awaits a Promise or
thenable returned as the successful payload.

## Type compatibility

- A recursive callback must allow a Promise because its descendants can run async work. A fully
  synchronous recursive schema can therefore have a mixed return type.
- Exact callback inference preserves separate branches such as `Bad<"a"> | Bad<"b">`. These remain
  assignable to `Bad<"a" | "b">`, and `InferBad` still returns `"a" | "b"`.
- Explicit constructor type arguments change with the new inference signatures. Prefer inferred
  callbacks. Existing `Sure<Error, Value, Input, Meta>` annotations remain synchronous; use the
  fifth parameter when an annotation must accept async work.
- Callbacks must expose all results through one call signature. TypeScript's `ReturnType` reads only
  the last overload, which can hide async results. Wrap an overloaded function in a callback that
  exposes the full input and return unions before composing it.
