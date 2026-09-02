#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

import {
  repositoryMigrationCurrentDocumentRoots,
  repositoryMigrationLegacyUseClassifications,
  repositoryMigrationMcpSurfaceRoots,
  repositoryMigrationStoredIdEdges,
  repositoryMigrationTablePairs,
} from "../apps/samebase/convex/repositoryMigration/manifest.ts";
import { isMainModule, resolveRepoRoot, runMain, ScriptError } from "./lib/scriptRuntime.ts";

const convexRoot = "apps/samebase/convex/";
const routeRoot = "apps/samebase/src/routes/";
const sourceRoot = "apps/samebase/src/";
const legacyTerm = "vault";
const auditedTextExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const convexFunctionBuilders = new Set([
  "action",
  "define",
  "httpAction",
  "internalAction",
  "internalMutation",
  "internalQuery",
  "mutation",
  "query",
]);

type LegacyClassificationRule = (typeof repositoryMigrationLegacyUseClassifications)[number];

type AuditSource = {
  path: string;
  content: string;
};

type LocatedValue = {
  path: string;
  line: number;
};

type TableDefinitionFinding = LocatedValue & {
  sourceTable: string;
  targetTable: string | null;
};

type StoredIdEdgeFinding = LocatedValue & {
  sourceTable: string;
  sourceField: string;
  referencedSourceTable: string;
  targetTable: string;
  targetField: string;
  referencedTargetTable: string;
};

type ConvexFunctionPathFinding = LocatedValue & {
  functionPath: string;
  kind: string;
};

type LegacySurfaceFinding = {
  path: string;
  legacyTermCount: number;
  terms: string[];
};

type RouteFinding = LocatedValue & {
  routePath: string;
};

type BrowserKeyFinding = LocatedValue & {
  expression: string;
};

type CreationTimeReadFinding = LocatedValue & {
  expression: string;
};

export type LegacyUseSummary = {
  path: string;
  line: number;
  legacyTermCount: number;
  category?: LegacyClassificationRule["category"];
  disposition?: LegacyClassificationRule["disposition"];
};

export type RepositoryMigrationAuditReport = {
  schemaVersion: 1;
  tablePairs: typeof repositoryMigrationTablePairs;
  storedIdEdges: StoredIdEdgeFinding[];
  inventories: {
    oldTableDefinitions: TableDefinitionFinding[];
    convexFunctionPaths: ConvexFunctionPathFinding[];
    mcpSurfaces: LegacySurfaceFinding[];
    routes: RouteFinding[];
    currentDocuments: LegacySurfaceFinding[];
    browserVaultIdKeys: BrowserKeyFinding[];
    creationTimeReads: CreationTimeReadFinding[];
  };
  legacyUses: LegacyUseSummary[];
  unclassifiedLegacyUses: LegacyUseSummary[];
  issues: string[];
};

function compareUtf8Bytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function compareLocatedValues(left: LocatedValue, right: LocatedValue): number {
  return compareUtf8Bytes(left.path, right.path) || left.line - right.line;
}

function gitTrackedAndUntrackedPaths(repoRoot: string): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repoRoot,
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return output
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.length > 0)
    .filter((filePath) => !filePath.startsWith("archive/"))
    .filter((filePath) => auditedTextExtensions.has(path.extname(filePath)))
    .sort(compareUtf8Bytes);
}

function readAuditSources(repoRoot: string): AuditSource[] {
  return gitTrackedAndUntrackedPaths(repoRoot).map((relativePath) => ({
    path: relativePath,
    content: readFileSync(path.join(repoRoot, relativePath), "utf8"),
  }));
}

function countLegacyTerms(content: string): number {
  let count = 0;
  let position = 0;
  const lowerContent = content.toLowerCase();

  for (;;) {
    const nextPosition = lowerContent.indexOf(legacyTerm, position);
    if (nextPosition === -1) {
      return count;
    }
    count += 1;
    position = nextPosition + legacyTerm.length;
  }
}

function lineAtOffset(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function firstLegacyTermLine(content: string): number {
  const offset = content.toLowerCase().indexOf(legacyTerm);
  return offset === -1 ? 1 : lineAtOffset(content, offset);
}

function pathMatchesRoot(filePath: string, root: string): boolean {
  return root.endsWith("/") ? filePath.startsWith(root) : filePath === root;
}

export function classifyRepositoryMigrationLegacyUse(
  filePath: string,
): LegacyClassificationRule | undefined {
  return repositoryMigrationLegacyUseClassifications.find((rule) =>
    "path" in rule ? rule.path === filePath : filePath.startsWith(rule.pathPrefix),
  );
}

export function collectRepositoryMigrationLegacyUses(sources: readonly AuditSource[]): {
  legacyUses: LegacyUseSummary[];
  unclassifiedLegacyUses: LegacyUseSummary[];
} {
  const legacyUses: LegacyUseSummary[] = [];

  for (const source of sources) {
    const legacyTermCount = countLegacyTerms(source.content);
    if (legacyTermCount === 0) {
      continue;
    }

    const classification = classifyRepositoryMigrationLegacyUse(source.path);
    legacyUses.push({
      path: source.path,
      line: firstLegacyTermLine(source.content),
      legacyTermCount,
      category: classification?.category,
      disposition: classification?.disposition,
    });
  }

  legacyUses.sort(compareLocatedValues);
  return {
    legacyUses,
    unclassifiedLegacyUses: legacyUses.filter((use) => use.category === undefined),
  };
}

function sourceFileFor(source: AuditSource): ts.SourceFile {
  const scriptKind = source.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(source.path, source.content, ts.ScriptTarget.Latest, true, scriptKind);
}

function lineForNode(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function visitNodes(node: ts.Node, visit: (current: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => visitNodes(child, visit));
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function containsDefineTableCall(node: ts.Node): boolean {
  let found = false;
  visitNodes(node, (current) => {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "defineTable"
    ) {
      found = true;
    }
  });
  return found;
}

function nearestPropertyName(node: ts.Node, boundary: ts.Node): string | undefined {
  let current: ts.Node = node.parent;
  while (current !== boundary && !ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current)) {
      return propertyNameText(current.name);
    }
    current = current.parent;
  }
  return undefined;
}

function validateInlineStoredIdReferences(
  sourceTable: string,
  tableInitializer: ts.Expression,
  oldTableNames: ReadonlySet<string>,
  issues: string[],
  reportedIssues: Set<string>,
): void {
  visitNodes(tableInitializer, (node) => {
    if (!ts.isCallExpression(node) || calledFunctionName(node) !== "id") {
      return;
    }
    const referencedSourceTable = stringArgument(node);
    if (referencedSourceTable === undefined || !oldTableNames.has(referencedSourceTable)) {
      return;
    }
    const sourceField = nearestPropertyName(node, tableInitializer);
    if (sourceField === undefined) {
      return;
    }
    const isClassified = repositoryMigrationStoredIdEdges.some(
      (edge) =>
        edge.sourceTable === sourceTable &&
        edge.referencedSourceTable === referencedSourceTable &&
        edge.sourceField.slice(edge.sourceField.lastIndexOf(".") + 1) === sourceField,
    );
    const issueKey = `${sourceTable}.${sourceField} -> ${referencedSourceTable}`;
    if (!isClassified && !reportedIssues.has(issueKey)) {
      reportedIssues.add(issueKey);
      issues.push(`Stored ID edge is not in the migration manifest: ${issueKey}`);
    }
  });
}

function collectTableDefinitions(
  sources: readonly AuditSource[],
  issues: string[],
): TableDefinitionFinding[] {
  const pairBySource = new Map<string, string>(
    repositoryMigrationTablePairs.map((pair) => [pair.source, pair.target]),
  );
  const oldTableNames: ReadonlySet<string> = new Set(pairBySource.keys());
  const reportedInlineEdgeIssues = new Set<string>();
  const findings: TableDefinitionFinding[] = [];

  for (const source of sources) {
    if (
      !source.path.startsWith(convexRoot) ||
      !source.path.endsWith(".ts") ||
      source.path.includes(".test.") ||
      source.path.includes(".generated.")
    ) {
      continue;
    }

    const sourceFile = sourceFileFor(source);
    visitNodes(sourceFile, (node) => {
      if (!ts.isPropertyAssignment(node) || !containsDefineTableCall(node.initializer)) {
        return;
      }
      const sourceTable = propertyNameText(node.name);
      if (sourceTable === undefined || !sourceTable.toLowerCase().includes(legacyTerm)) {
        return;
      }
      const targetTable = pairBySource.get(sourceTable);
      if (targetTable === undefined) {
        issues.push(`Old table definition is not in the migration manifest: ${sourceTable}`);
      } else {
        validateInlineStoredIdReferences(
          sourceTable,
          node.initializer,
          oldTableNames,
          issues,
          reportedInlineEdgeIssues,
        );
      }
      findings.push({
        path: source.path,
        line: lineForNode(sourceFile, node.name),
        sourceTable,
        targetTable: targetTable ?? null,
      });
    });
  }

  return findings.sort(compareLocatedValues);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectStoredIdEdges(
  sourceByPath: ReadonlyMap<string, AuditSource>,
  issues: string[],
): StoredIdEdgeFinding[] {
  const findings: StoredIdEdgeFinding[] = [];

  for (const edge of repositoryMigrationStoredIdEdges) {
    const source = sourceByPath.get(edge.witnessPath);
    if (source === undefined) {
      issues.push(`Stored ID edge witness is missing: ${edge.witnessPath}`);
      continue;
    }

    const fieldName = edge.sourceField.slice(edge.sourceField.lastIndexOf(".") + 1);

    const witnessPattern = new RegExp(
      `\\b${escapeRegExp(fieldName)}\\s*:\\s*(?:v\\.)?id\\(\\s*["']${escapeRegExp(edge.referencedSourceTable)}["']\\s*\\)`,
    );
    const witnessLineIndexes: number[] = [];
    for (const [lineIndex, line] of source.content.split("\n").entries()) {
      if (witnessPattern.test(line)) {
        witnessLineIndexes.push(lineIndex);
      }
    }
    const witnessLineIndex = witnessLineIndexes.at(edge.witnessOccurrence - 1);
    if (witnessLineIndex === undefined) {
      issues.push(
        `Stored ID edge validator witness ${edge.witnessOccurrence} is missing: ${edge.sourceTable}.${edge.sourceField} -> ${edge.referencedSourceTable}`,
      );
      continue;
    }

    findings.push({
      path: source.path,
      line: witnessLineIndex + 1,
      sourceTable: edge.sourceTable,
      sourceField: edge.sourceField,
      referencedSourceTable: edge.referencedSourceTable,
      targetTable: edge.targetTable,
      targetField: edge.targetField,
      referencedTargetTable: edge.referencedTargetTable,
    });
  }

  return findings.sort(compareLocatedValues);
}

function hasExportModifier(statement: ts.VariableStatement): boolean {
  return (
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}

function calledFunctionName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) {
    return call.expression.text;
  }
  if (ts.isPropertyAccessExpression(call.expression)) {
    return call.expression.name.text;
  }
  return undefined;
}

function convexFunctionModulePath(filePath: string): string {
  const withoutRoot = filePath.slice(convexRoot.length);
  return withoutRoot.replace(/\.ts$/, "");
}

function collectConvexFunctionPaths(sources: readonly AuditSource[]): ConvexFunctionPathFinding[] {
  const findings: ConvexFunctionPathFinding[] = [];

  for (const source of sources) {
    if (
      !source.path.startsWith(convexRoot) ||
      !source.path.endsWith(".ts") ||
      source.path.includes(".test.") ||
      source.path.includes(".generated.")
    ) {
      continue;
    }

    const sourceFile = sourceFileFor(source);
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          declaration.initializer === undefined ||
          !ts.isCallExpression(declaration.initializer)
        ) {
          continue;
        }
        const kind = calledFunctionName(declaration.initializer);
        if (kind === undefined || !convexFunctionBuilders.has(kind)) {
          continue;
        }
        const functionPath = `${convexFunctionModulePath(source.path)}:${declaration.name.text}`;
        if (!functionPath.toLowerCase().includes(legacyTerm)) {
          continue;
        }
        findings.push({
          path: source.path,
          line: lineForNode(sourceFile, declaration.name),
          functionPath,
          kind,
        });
      }
    }
  }

  return findings.sort(compareLocatedValues);
}

function collectLegacyTerms(content: string): string[] {
  const matches = content.match(/[A-Za-z0-9_$./:-]*vault[A-Za-z0-9_$./:-]*/gi) ?? [];
  return [...new Set(matches)].sort(compareUtf8Bytes);
}

function collectLegacySurfaceFiles(
  sources: readonly AuditSource[],
  roots: readonly string[],
): LegacySurfaceFinding[] {
  return sources
    .filter((source) => roots.some((root) => pathMatchesRoot(source.path, root)))
    .map((source) => ({
      path: source.path,
      legacyTermCount: countLegacyTerms(source.content),
      terms: collectLegacyTerms(source.content),
    }))
    .filter((finding) => finding.legacyTermCount > 0)
    .sort((left, right) => compareUtf8Bytes(left.path, right.path));
}

function stringArgument(call: ts.CallExpression): string | undefined {
  const firstArgument = call.arguments.at(0);
  if (
    firstArgument !== undefined &&
    (ts.isStringLiteral(firstArgument) || ts.isNoSubstitutionTemplateLiteral(firstArgument))
  ) {
    return firstArgument.text;
  }
  return undefined;
}

function collectRoutes(sources: readonly AuditSource[]): RouteFinding[] {
  const findings: RouteFinding[] = [];

  for (const source of sources) {
    if (!source.path.startsWith(routeRoot) || !/\.tsx?$/.test(source.path)) {
      continue;
    }
    const sourceFile = sourceFileFor(source);
    visitNodes(sourceFile, (node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isIdentifier(node.expression) ||
        node.expression.text !== "createFileRoute"
      ) {
        return;
      }
      const routePath = stringArgument(node);
      if (
        routePath === undefined ||
        (!source.path.toLowerCase().includes(legacyTerm) &&
          !routePath.toLowerCase().includes(legacyTerm))
      ) {
        return;
      }
      findings.push({
        path: source.path,
        line: lineForNode(sourceFile, node),
        routePath,
      });
    });
  }

  return findings.sort(compareLocatedValues);
}

function isBrowserKeyExpression(node: ts.Node): boolean {
  if (!ts.isArrayLiteralExpression(node) && !ts.isTemplateExpression(node)) {
    return false;
  }
  if (!node.getText().toLowerCase().includes("vaultid")) {
    return false;
  }

  let current: ts.Node = node.parent;
  while (!ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current)) {
      const name = propertyNameText(current.name);
      if (name !== undefined && /key|cache|storage|uri/i.test(name)) {
        return true;
      }
    }
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      if (/^(getItem|removeItem|setItem)$/.test(current.expression.name.text)) {
        return true;
      }
    }
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) {
      if (
        current.name !== undefined &&
        ts.isIdentifier(current.name) &&
        /key|cache|storage|uri/i.test(current.name.text)
      ) {
        return true;
      }
    }
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      /key|cache|storage|uri/i.test(current.name.text)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, " ").trim();
}

function collectBrowserVaultIdKeys(sources: readonly AuditSource[]): BrowserKeyFinding[] {
  const findings: BrowserKeyFinding[] = [];

  for (const source of sources) {
    if (!source.path.startsWith(sourceRoot) || !/\.tsx?$/.test(source.path)) {
      continue;
    }
    const sourceFile = sourceFileFor(source);
    visitNodes(sourceFile, (node) => {
      if (!isBrowserKeyExpression(node)) {
        return;
      }
      findings.push({
        path: source.path,
        line: lineForNode(sourceFile, node),
        expression: normalizeExpression(node.getText(sourceFile)),
      });
    });
  }

  return findings.sort(compareLocatedValues);
}

function isCreationTimeBindingRead(node: ts.BindingElement): boolean {
  const name = node.propertyName ?? node.name;
  if (!ts.isIdentifier(name) || name.text !== "_creationTime") {
    return false;
  }

  let current: ts.Node = node.parent;
  while (!ts.isSourceFile(current) && !ts.isVariableDeclaration(current)) {
    if (ts.isParameter(current)) {
      return false;
    }
    current = current.parent;
  }
  return ts.isVariableDeclaration(current) && current.initializer !== undefined;
}

function isCreationTimeRead(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === "_creationTime";
  }
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return ts.isStringLiteral(argument) && argument.text === "_creationTime";
  }
  return ts.isBindingElement(node) && isCreationTimeBindingRead(node);
}

function collectCreationTimeReads(sources: readonly AuditSource[]): CreationTimeReadFinding[] {
  const findings: CreationTimeReadFinding[] = [];

  for (const source of sources) {
    if (
      (!source.path.startsWith(convexRoot) && !source.path.startsWith(sourceRoot)) ||
      !/\.tsx?$/.test(source.path) ||
      source.path.includes(".test.") ||
      source.path.includes(".generated.")
    ) {
      continue;
    }
    const sourceFile = sourceFileFor(source);
    visitNodes(sourceFile, (node) => {
      if (!isCreationTimeRead(node)) {
        return;
      }
      findings.push({
        path: source.path,
        line: lineForNode(sourceFile, node),
        expression: normalizeExpression(node.getText(sourceFile)),
      });
    });
  }

  return findings.sort(compareLocatedValues);
}

function validateManifest(
  issues: string[],
  tablePairs: readonly { source: string; target: string }[] = repositoryMigrationTablePairs,
): void {
  if (tablePairs.length !== 21) {
    issues.push(`Repository migration manifest has ${tablePairs.length} table pairs instead of 21`);
  }

  const pairBySource = new Map<string, string>();
  const sourceByTarget = new Map<string, string>();
  for (const pair of tablePairs) {
    if (pairBySource.has(pair.source)) {
      issues.push(`Duplicate source table pair: ${pair.source}`);
    }
    if (sourceByTarget.has(pair.target)) {
      issues.push(`Duplicate target table pair: ${pair.target}`);
    }
    pairBySource.set(pair.source, pair.target);
    sourceByTarget.set(pair.target, pair.source);
  }

  const edgeKeys = new Set<string>();
  for (const edge of repositoryMigrationStoredIdEdges) {
    const edgeKey = `${edge.sourceTable}.${edge.sourceField}`;
    if (edgeKeys.has(edgeKey)) {
      issues.push(`Duplicate stored ID edge: ${edgeKey}`);
    }
    edgeKeys.add(edgeKey);

    if (pairBySource.get(edge.sourceTable) !== edge.targetTable) {
      issues.push(`Stored ID edge has the wrong target table: ${edgeKey}`);
    }
    if (pairBySource.get(edge.referencedSourceTable) !== edge.referencedTargetTable) {
      issues.push(`Stored ID edge has the wrong referenced target table: ${edgeKey}`);
    }
  }
}

function validateTableDefinitions(
  tableDefinitions: readonly TableDefinitionFinding[],
  issues: string[],
): void {
  const countBySource = new Map<string, number>();
  for (const definition of tableDefinitions) {
    countBySource.set(definition.sourceTable, (countBySource.get(definition.sourceTable) ?? 0) + 1);
  }

  for (const pair of repositoryMigrationTablePairs) {
    const count = countBySource.get(pair.source) ?? 0;
    if (count !== 1) {
      issues.push(`Expected one old table definition for ${pair.source}, found ${count}`);
    }
  }
}

export function auditRepositoryMigration(repoRoot: string): RepositoryMigrationAuditReport {
  const sources = readAuditSources(repoRoot);
  const sourceByPath = new Map(sources.map((source) => [source.path, source]));
  const issues: string[] = [];

  validateManifest(issues);
  const oldTableDefinitions = collectTableDefinitions(sources, issues);
  validateTableDefinitions(oldTableDefinitions, issues);
  const storedIdEdges = collectStoredIdEdges(sourceByPath, issues);
  const { legacyUses, unclassifiedLegacyUses } = collectRepositoryMigrationLegacyUses(sources);

  return {
    schemaVersion: 1,
    tablePairs: repositoryMigrationTablePairs,
    storedIdEdges,
    inventories: {
      oldTableDefinitions,
      convexFunctionPaths: collectConvexFunctionPaths(sources),
      mcpSurfaces: collectLegacySurfaceFiles(sources, repositoryMigrationMcpSurfaceRoots),
      routes: collectRoutes(sources),
      currentDocuments: collectLegacySurfaceFiles(sources, repositoryMigrationCurrentDocumentRoots),
      browserVaultIdKeys: collectBrowserVaultIdKeys(sources),
      creationTimeReads: collectCreationTimeReads(sources),
    },
    legacyUses,
    unclassifiedLegacyUses,
    issues: issues.sort(compareUtf8Bytes),
  };
}

export function formatRepositoryMigrationAudit(report: RepositoryMigrationAuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function assertRepositoryMigrationAudit(report: RepositoryMigrationAuditReport): void {
  if (report.issues.length === 0 && report.unclassifiedLegacyUses.length === 0) {
    return;
  }

  throw new ScriptError(
    `Repository migration audit failed with ${report.issues.length} manifest issue(s) and ${report.unclassifiedLegacyUses.length} unclassified old-name file(s).`,
  );
}

if (isMainModule(import.meta.url)) {
  await runMain(() => {
    const report = auditRepositoryMigration(resolveRepoRoot());
    process.stdout.write(formatRepositoryMigrationAudit(report));
    assertRepositoryMigrationAudit(report);
  });
}
