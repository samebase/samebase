// The Convex tables of the broker, made from `tables.ts`: each document's Effect Schema becomes a
// Convex validator, and each declared index becomes a Convex index on the same field paths. Only
// the AST kinds that `tables.ts` uses convert; any other kind throws when the schema is evaluated.
// Checks (`Schema.Finite`) do not convert: the `Tx` encodes every write with the table's Effect
// Schema, so the Convex validator only has to hold the same shape.
import { defineTable, type TableDefinition } from "convex/server";
import { v, type Validator } from "convex/values";
import { SchemaAST } from "effect";
import { tableNames, tables, type TableName } from "../../store/tables.ts";
import type { IndexField } from "../../store/Tx.ts";

type Value = Validator<unknown, "required", string>;

const value = (ast: SchemaAST.AST): Value => {
  switch (ast._tag) {
    case "String":
      return v.string();
    case "Number":
      return v.number();
    case "Boolean":
      return v.boolean();
    case "Literal": {
      const { literal } = ast;
      if (typeof literal === "bigint") {
        throw new Error("A bigint literal has no Convex validator here");
      }
      return v.literal(literal);
    }
    case "Arrays": {
      const [item, ...more] = ast.rest;
      if (ast.elements.length > 0 || item === undefined || more.length > 0) {
        throw new Error("Only arrays of one item type convert");
      }
      return v.array(value(item));
    }
    case "Objects":
      return object(ast);
    case "Union":
      return v.union(...ast.types.map(value));
    default:
      throw new Error(`The schema kind ${ast._tag} has no Convex validator here`);
  }
};

const object = (ast: SchemaAST.Objects) => {
  if (ast.indexSignatures.length > 0) {
    throw new Error("Records have no Convex validator here");
  }
  return v.object(
    Object.fromEntries(
      ast.propertySignatures.map((property) => {
        if (typeof property.name !== "string") {
          throw new Error("Only string keys convert");
        }
        const field = value(property.type);
        return [property.name, SchemaAST.isOptional(property.type) ? v.optional(field) : field];
      }),
    ),
  );
};

/** A table's document validator: an object, or a union of objects. */
const document = (ast: SchemaAST.AST) => {
  switch (ast._tag) {
    case "Objects":
      return object(ast);
    case "Union":
      return v.union(
        ...ast.types.map((member) => {
          if (member._tag !== "Objects") {
            throw new Error("A document union holds objects only");
          }
          return object(member);
        }),
      );
    default:
      throw new Error(`A document is an object or a union of objects, not ${ast._tag}`);
  }
};

const table = (name: TableName): TableDefinition => {
  let definition: TableDefinition = defineTable(
    document(SchemaAST.toEncoded(tables[name].schema.ast)),
  );
  for (const [index, fields] of Object.entries<ReadonlyArray<IndexField>>(tables[name].indexes)) {
    const [first, ...rest] = fields.map((field) => field.path);
    if (first === undefined) {
      throw new Error(`${name}.${index} has no fields`);
    }
    definition = definition.index(index, [first, ...rest]);
  }
  return definition;
};

/** Every table of the broker, for `defineSchema`. */
export const brokerTables: Record<string, TableDefinition> = Object.fromEntries(
  tableNames.map((name) => [name, table(name)]),
);
