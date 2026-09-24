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

`pure` and `sure` retain the callback's result type. A callback that only returns `good` therefore
has error type `never` and can be used in a collection without an annotation. Explicit constructor
type arguments have changed; prefer inferred callbacks. `Sure<Error, Value, Input, Meta>` and all
validation in this change remain synchronous.
