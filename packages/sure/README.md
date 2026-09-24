# @samebase/sure

Tiny validation primitives built around four small functions:

- `good(value)`
- `bad(issue)`
- `pure(validator)`
- `sure(validator, meta)`

This package stays generic. App-specific protocols such as route search params should build their
own codecs on top of these validators instead of adding domain concepts here.

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
