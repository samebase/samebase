# @samebase/sure

Tiny validation primitives built around four small functions:

- `good(value)`
- `bad(issues)`
- `pure(validator)`
- `sure(validator, meta)`

The validators in this package report a flat list of issues. Each issue has a `message`, and a
`path` when it is about a part of the value:

```ts
const user = object({ name: string, tags: array(string) });

user({ tags: ["a", 1] });
// [false, [
//   { message: "not string", path: ["name"] },
//   { message: "not string", path: ["tags", 1] },
// ]]
```

The issues have the shape of [Standard Schema](https://standardschema.dev) issues, and
`standard(validator)` can be passed to any library that accepts a Standard Schema.

This package stays generic. App-specific protocols such as route search params should build their
own codecs on top of these validators instead of adding domain concepts here.
