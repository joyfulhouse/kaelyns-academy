import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function activityPlayerProps(): ts.InterfaceDeclaration {
  const path = new URL("./types.ts", import.meta.url);
  const source = ts.createSourceFile(
    path.pathname,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === "ActivityPlayerProps",
  );

  if (!declaration) throw new Error("ActivityPlayerProps interface is missing");
  return declaration;
}

describe("ActivityPlayerProps", () => {
  it("exposes a response-only completion callback", () => {
    const onComplete = activityPlayerProps().members.find(
      (member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) &&
        ts.isIdentifier(member.name) &&
        member.name.text === "onComplete",
    );

    expect(onComplete).toBeDefined();
    const callbackType = onComplete?.type;
    expect(callbackType && ts.isFunctionTypeNode(callbackType)).toBe(true);
    if (!callbackType || !ts.isFunctionTypeNode(callbackType)) return;

    expect(callbackType.parameters).toHaveLength(1);
    expect(callbackType.parameters[0]?.name.getText()).toBe("response");
    expect(callbackType.parameters[0]?.questionToken).toBeUndefined();
  });
});
