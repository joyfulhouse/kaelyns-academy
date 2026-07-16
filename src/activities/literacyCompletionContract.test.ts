import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PLAYER_PATHS = [
  "./phonics-wordbuild/Player.tsx",
  "./sightword-game/Player.tsx",
  "./reading-comprehension/Player.tsx",
  "./oral-reading/Player.tsx",
  "./oral-reading/SentenceReader.tsx",
] as const;

function playerSource(relativePath: (typeof PLAYER_PATHS)[number]): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function sourceFile(relativePath: (typeof PLAYER_PATHS)[number]): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    playerSource(relativePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function descendants(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

describe("literacy Player completion contract", () => {
  it.each(PLAYER_PATHS)("keeps rewards and scoring out of %s", (relativePath) => {
    const file = sourceFile(relativePath);
    const imports = file.statements.filter(ts.isImportDeclaration);

    expect(
      imports.some(
        (declaration) =>
          ts.isStringLiteral(declaration.moduleSpecifier) &&
          declaration.moduleSpecifier.text.endsWith("/RewardOverlay"),
      ),
    ).toBe(false);

    const importedNames = imports.flatMap((declaration) => {
      const bindings = declaration.importClause?.namedBindings;
      return bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map((element) => element.name.text)
        : [];
    });
    expect(importedNames).not.toContain("score");
  });

  it.each(PLAYER_PATHS)("submits one bounded response argument from %s", (relativePath) => {
    const calls = descendants(sourceFile(relativePath)).filter(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "onComplete" &&
        node.arguments.length > 0,
    );

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.map((call) => call.arguments.length)).toEqual(
      Array.from({ length: calls.length }, () => 1),
    );
  });

  it.each(PLAYER_PATHS)("has no local done/reward phase in %s", (relativePath) => {
    expect(playerSource(relativePath)).not.toMatch(/\[\s*done\s*,\s*setDone\s*\]/);
  });
});
