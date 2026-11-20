import { posix } from "node:path";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

const decoder = new TextDecoder();

function tarField(header: Uint8Array, start: number, length: number) {
  const text = decoder.decode(header.subarray(start, start + length));
  const end = text.indexOf("\0");
  return end === -1 ? text : text.slice(0, end);
}

/**
 * The text of each file of alchemy-run/alchemy at the git `ref` whose path, without the archive's
 * top folder, `keep` accepts. GitHub serves the ref as one tar.gz, read here in memory.
 */
export async function readAlchemySource(ref: string, keep: (path: string) => boolean) {
  const response = await fetch(`https://codeload.github.com/alchemy-run/alchemy/tar.gz/${ref}`);
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for alchemy-run/alchemy at ${ref}`);
  }
  const tar = gunzipSync(new Uint8Array(await response.arrayBuffer()));
  const files = new Map<string, string>();
  let paxPath: string | undefined;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(tarField(header, 124, 12), 8);
    const type = tarField(header, 156, 1);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(decoder.decode(body))?.[1];
      continue;
    }
    const prefix = tarField(header, 345, 155);
    const name = tarField(header, 0, 100);
    const path = paxPath ?? (prefix === "" ? name : `${prefix}/${name}`);
    paxPath = undefined;
    if (type !== "0" && type !== "") continue;
    const inner = path.slice(path.indexOf("/") + 1);
    if (keep(inner)) files.set(inner, decoder.decode(body));
  }
  return files;
}

/** TypeScript files of the provider packages, where every resource type is declared. */
export const isPackageSource = (path: string) =>
  /^packages\/[^/]+\/src\/.+\.ts$/.test(path) && !path.endsWith(".d.ts");

/** Parsed TypeScript files by path, parsed on first use. */
export class SourceFiles {
  readonly #texts: ReadonlyMap<string, string>;
  readonly #parsed = new Map<string, ts.SourceFile>();

  constructor(texts: ReadonlyMap<string, string>) {
    this.#texts = texts;
  }

  paths() {
    return this.#texts.keys();
  }

  text(path: string) {
    return this.#texts.get(path);
  }

  get(path: string) {
    const cached = this.#parsed.get(path);
    if (cached !== undefined) return cached;
    const text = this.#texts.get(path);
    if (text === undefined) return undefined;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    this.#parsed.set(path, source);
    return source;
  }

  /**
   * The string an expression always has: a string literal, or a `const` of this file or one
   * imported from a relative path, followed through `as const`. Undefined for anything else.
   */
  stringValue(expression: ts.Expression, source: ts.SourceFile): string | undefined {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    if (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
      return this.stringValue(expression.expression, source);
    }
    if (!ts.isIdentifier(expression)) return undefined;
    return this.#constantValue(expression.text, source, new Set());
  }

  #constantValue(name: string, source: ts.SourceFile, seen: Set<string>): string | undefined {
    const key = `${source.fileName}#${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement)) {
        if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name &&
            declaration.initializer !== undefined
          ) {
            return this.stringValue(declaration.initializer, source);
          }
        }
      }
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.startsWith(".") &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          if (element.name.text !== name) continue;
          const target = this.get(
            posix.join(posix.dirname(source.fileName), statement.moduleSpecifier.text),
          );
          if (target === undefined) return undefined;
          return this.#constantValue(element.propertyName?.text ?? name, target, seen);
        }
      }
    }
    return undefined;
  }
}

const constructorModules =
  /^(alchemy(\/Resource|\/Platform)?|\.{1,2}\/(.*\/)?(Resource|Platform)\.ts)$/;

/**
 * Local names this file gives to Alchemy's `Resource` and `Platform`, the two functions that
 * declare a resource type. Bindings, actions and policies have their own constructors.
 */
function resourceConstructors(source: ts.SourceFile) {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !constructorModules.test(statement.moduleSpecifier.text) ||
      statement.importClause?.isTypeOnly ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (!element.isTypeOnly && (imported === "Resource" || imported === "Platform")) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

/**
 * A top-level function that passes its parameter `index` to `Resource` or `Platform`, such as
 * `makeHostedPlatform(typeId, ...)` in effect-cluster. Its callers declare the types.
 */
interface Factory {
  path: string;
  name: string;
  index: number;
}

/** The factory a type argument is a parameter of, when that argument is one. */
function factoryOf(argument: ts.Expression, path: string): Factory | undefined {
  if (!ts.isIdentifier(argument)) return undefined;
  for (let node: ts.Node = argument; !ts.isSourceFile(node); node = node.parent) {
    if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) continue;
    const index = node.parameters.findIndex(
      (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === argument.text,
    );
    if (index === -1) continue;
    const declaration = node.parent;
    if (
      ts.isVariableDeclaration(declaration) &&
      ts.isIdentifier(declaration.name) &&
      ts.isSourceFile(declaration.parent.parent.parent)
    ) {
      return { path, name: declaration.name.text, index };
    }
    return undefined;
  }
  return undefined;
}

/** Local names of `factory` in `source`: its own name, or a named import of its file. */
function factoryNames(factory: Factory, source: ts.SourceFile) {
  const names = new Set<string>();
  if (source.fileName === factory.path) names.add(factory.name);
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      posix.join(posix.dirname(source.fileName), statement.moduleSpecifier.text) === factory.path &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        if ((element.propertyName?.text ?? element.name.text) === factory.name) {
          names.add(element.name.text);
        }
      }
    }
  }
  return names;
}

/** A `Resource(...)` or `Platform(...)` call whose type is not a constant string. */
export interface UnresolvedDeclaration {
  path: string;
  text: string;
}

/**
 * Every resource type tag the files declare: the first argument of each `Resource(...)` and
 * `Platform(...)` call, directly or through a factory, and the `aliases` in its options. Each tag
 * maps to the first file that declares it.
 */
export function declaredResourceTypes(files: SourceFiles) {
  const tags = new Map<string, string>();
  const unresolved: UnresolvedDeclaration[] = [];
  const factories: Factory[] = [];
  const paths = [...files.paths()].sort();
  const scan = (
    pattern: RegExp,
    constructors: (source: ts.SourceFile) => Set<string>,
    index: number,
  ) => {
    for (const path of paths) {
      const text = files.text(path);
      if (text === undefined || !pattern.test(text)) continue;
      const source = files.get(path);
      if (source === undefined) continue;
      const names = constructors(source);
      if (names.size === 0) continue;
      const add = (expression: ts.Expression) => {
        const tag = files.stringValue(expression, source);
        if (tag !== undefined) {
          if (!tags.has(tag)) tags.set(tag, path);
          return;
        }
        const factory = factoryOf(expression, path);
        if (factory === undefined) unresolved.push({ path, text: expression.getText() });
        else factories.push(factory);
      };
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          names.has(node.expression.text)
        ) {
          const type = node.arguments[index];
          const options = node.arguments[index + 1];
          if (type !== undefined) add(type);
          if (options !== undefined && ts.isObjectLiteralExpression(options)) {
            for (const property of options.properties) {
              if (
                ts.isPropertyAssignment(property) &&
                ts.isIdentifier(property.name) &&
                property.name.text === "aliases" &&
                ts.isArrayLiteralExpression(property.initializer)
              ) {
                property.initializer.elements.forEach(add);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  scan(/\b(Resource|Platform)\b/, resourceConstructors, 0);
  for (const factory of factories.splice(0)) {
    scan(
      new RegExp(`\\b${factory.name}\\b`),
      (source) => factoryNames(factory, source),
      factory.index,
    );
  }
  return { tags, unresolved };
}
