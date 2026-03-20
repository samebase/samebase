# TypeScript As Lisp-Like Surface Syntax Research

Date: 2026-03-21

## Why This Document Exists

This is a living research note for the question:

- Can a standard-looking language such as TypeScript or Go be represented with a
  Lisp-like core?
- Can grouping delimiters become mostly interchangeable?
- Can the head position move before the delimiter, so forms look more like
  `f(x y)` than `(f x y)`?
- Would TypeScript module semantics, especially ESM, block that design?

The goal is not to define a production grammar yet. The goal is to establish
what is structurally possible, what breaks, and which existing language designs
are closest to the desired shape.

## Why This Lives In `docs/research`

This is exploratory language-design research. It does not define a current
runtime contract or an accepted implementation plan for Noter, so it belongs in
`docs/research/` instead of `specs/`.

## Current Conclusion

Representing TypeScript with a Lisp-like core is viable if it is treated as an
alternate surface syntax that lowers into a normal TypeScript or JavaScript
representation.

TypeScript itself is not the hard blocker. ESM is not the hard blocker either.
The hard blocker is the stronger claim that all grouping delimiters should be
interchangeable without carrying any built-in meaning.

That rule collides with real distinctions that TypeScript and JavaScript encode
today:

- `()` distinguishes grouping and calls.
- `[]` distinguishes arrays, tuples, indexing, computed property access, and
  mapped type syntax.
- `{}` distinguishes object literals, blocks, import/export lists, and many
  type-level forms.

If delimiter shape stops carrying meaning, those distinctions have to be
reintroduced through explicit heads, keywords, or context rules.

## Practical Feasibility

The design appears feasible under this model:

1. Parse a new surface syntax.
2. Lower that syntax into a canonical tree with explicit node kinds.
3. Emit standard TypeScript AST or JavaScript plus type metadata.
4. Preserve ESM linking and evaluation rules during lowering.

Under that model, the syntax is mostly a front-end problem, not a semantic
impossibility.

## The Real Constraints

### Delimiter Indifference Loses Existing Categories

Making `()`, `[]`, and `{}` equivalent removes distinctions that current
TypeScript and JavaScript rely on heavily.

If that choice is intentional, the language likely needs explicit forms such as:

- `call[f x y]` or `f[x y]`
- `array[a b c]`
- `tuple[a b]`
- `object[key value other value]`
- `index[target key]`
- `block[stmt1 stmt2]`
- `record-type[...]`
- `mapped-type[...]`

Without that kind of explicit replacement, too much meaning is lost.

### TypeScript Has Context-Sensitive Surface Syntax

TypeScript already carries several parsing ambiguities and context-sensitive
forms. That is a warning sign for any alternate syntax, but it is also an
opportunity to simplify.

Examples:

- JSX conflicts with angle-bracket type assertions, which is why `.tsx` pushes
  users toward `x as T`.
- Type-level and value-level namespaces overlap in surface syntax.
- Destructuring, optional chaining, template literals, decorators, and overloads
  all have specialized parsing rules.

An alternate syntax can avoid some of these ambiguities by making type
constructs more explicit instead of trying to preserve every TypeScript token
pattern.

### Standard-Looking Syntax Has A Cost

If the syntax should feel visually close to TypeScript or Go, then it will need
more than simple lists. It will likely need:

- infix operators or a disciplined lowering strategy for them
- a concrete story for member access and indexing
- a concrete story for object literals versus blocks
- a concrete story for generics and type application
- a concrete story for JSX, or an explicit decision to exclude it

That is all feasible, but it moves the design away from pure reader sugar and
toward a real front-end language.

## ESM Is Not A Blocker

ESM is representable, but it should not be modeled as ordinary runtime
function-call sugar.

The key constraint is that `import` and `export` participate in module linking
and evaluation before normal runtime execution. They are not just expressions.

That means an alternate syntax must preserve at least these semantics:

- imports and exports are module-level forms
- imported names are live bindings, not copied values
- top-level `await` affects module evaluation order
- type-only imports and exports remain erasable where TypeScript expects them to
  disappear from emitted JavaScript

A Lisp-like representation can still encode that cleanly. It just needs module
forms to lower to actual ESM constructs instead of pretending they are ordinary
calls.

Possible canonical forms:

- `import["node:path" default path]`
- `import["react" names[useState useEffect]]`
- `import-type["./types" names[UserId]]`
- `export[name foo]`
- `export-default[expr]`
- `export-from["./x" names[foo bar]]`
- `await-top[expr]`

The important part is not the exact spelling. The important part is preserving
static module semantics during lowering.

## Strong Prior Art

Several existing systems already cover parts of this design space.

### M-Expressions

John McCarthy's early Lisp notation already used head-before-delimiter forms
such as `f[x; y]`. This is the clearest precedent for the idea that function
head position can move before grouping.

### Neoteric Expressions

David Wheeler's readable Lisp work explicitly treats `f(x)` as a readable
surface form for prefix application. This is the closest direct precedent for
"standard-looking surface, Lisp core."

### Scheme And Racket Bracket Synonymy

Some Scheme-family systems already treat `[]` as synonyms for `()`, and some
also allow `{}` similarly. This shows that delimiter synonymy is not alien to
the Lisp family.

However, those systems typically stop short of making all delimiter kinds fully
meaningless across all constructs in a TypeScript-like language.

### Dylan

Dylan is strong evidence that a language can keep a Lisp-like macro and
language-extension heritage while using a more conventional surface syntax.

### Rhombus

Rhombus is important because it separates a richer surface notation from the
underlying macro-expansion model. It suggests a practical implementation path:
preserve explicit syntactic categories in the syntax tree even when the surface
notation looks less parenthesized.

## Working Design Direction

The safest version of this design appears to be:

1. Keep a canonical tree representation with explicit node kinds.
2. Allow head-before-grouping for calls and special forms.
3. Allow multiple delimiter pairs as surface-level equivalents only where doing
   so does not destroy needed distinctions.
4. Reintroduce lost distinctions through explicit heads instead of relying on
   punctuation alone.
5. Treat module forms as first-class syntax categories, not library calls.

In practice, that probably means not making delimiter choice universally
meaningless. Instead, the syntax should make delimiter choice mostly cosmetic in
some positions, while reserving explicit forms where the source language needs
different structure.

## Open Questions

The next questions worth resolving are:

1. Should arrays, tuples, objects, and blocks remain visually distinct, or
   should they become explicit headed forms?
2. Should generic application and function calls share one notation, or stay
   separate?
3. Should infix operators remain user-facing syntax, or lower immediately into
   prefix forms?
4. Is JSX in scope, or should the design target non-JSX TypeScript first?
5. Should the design lower to TypeScript AST directly, or lower first into a
   language-neutral canonical form?

## Recommended Next Step

The next useful artifact is a tiny grammar for a constrained TypeScript subset:

- declarations
- function calls
- object literals
- arrays
- property access
- type annotations
- imports and exports

That would make the tradeoffs concrete and expose where delimiter synonymy still
works cleanly versus where it forces awkward explicit forms.

## Sources

- John McCarthy, "Recursive Functions of Symbolic Expressions and Their
  Computation by Machine, Part I":
  [HTML](https://www-formal.stanford.edu/jmc/recursive.html),
  [PDF](https://www-formal.stanford.edu/jmc/recursive.pdf)
- David A. Wheeler, readable Lisp and neoteric expressions:
  [Sweet-expressions overview](https://dwheeler.com/readable/sweet-expressions.html),
  [SRFI neoteric expressions](https://sourceforge.net/p/readable/wiki/SRFI-Neoteric/)
- Scheme survey for brackets and braces:
  [Brackets/braces](https://docs.scheme.org/surveys/brackets-braces/)
- Racket documentation:
  [Notation](https://docs.racket-lang.org/reference/notation.html),
  [Editing with parentheses](https://docs.racket-lang.org/drracket/editor.html)
- Rhombus paper:
  [Rhombus: A New Spin on Macros without All the Parentheses](https://users.cs.utah.edu/plt/publications/oopsla23-faadffggkkmppst.pdf)
- TypeScript documentation:
  [JSX](https://www.typescriptlang.org/docs/handbook/jsx.html),
  [TypeScript 3.8 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html),
  [TypeScript 4.7 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html),
  [Modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html),
  [verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
- ECMAScript specification:
  [Modules grammar](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html),
  [Module Environment Records](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html#sec-module-environment-records)
