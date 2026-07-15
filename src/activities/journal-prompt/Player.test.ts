import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Player.tsx", import.meta.url), "utf8");

function functionBody(name: string, nextName: string): string {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  return source.slice(start, end);
}

describe("journal-prompt Player participation contract", () => {
  it("draws a visible dot and counts once on pointer-down, not per move segment", () => {
    const startDraw = functionBody("startDraw", "moveDraw");
    const moveDraw = functionBody("moveDraw", "endDraw");

    expect(source).toContain("onPointerDown={startDraw}");
    expect(startDraw).toContain("context.arc(");
    expect(startDraw).toContain("context.fill();");
    expect(startDraw).toContain("setMarkCount(");
    expect(moveDraw).not.toContain("setMarkCount(");
  });

  it("starts child text empty, clears both contribution paths, and gates Done", () => {
    const clearDrawing = functionBody("clearDrawing", "changeText");
    const clearIdea = functionBody("clearIdea", "finish");

    expect(source).toContain('const [text, setText] = useState("")');
    expect(source).toContain("{parsed.sentenceStarter}");
    expect(clearDrawing).toContain("setMarkCount(0)");
    expect(clearIdea).toContain('setText("")');
    expect(clearIdea).toContain("setUsedDictation(false)");
    expect(source).toContain("disabled={!canFinish}");
  });

  it("submits only the bounded summary fields", () => {
    const finish = functionBody("finish", "ComposeView");
    expect(finish).toContain("markCount,");
    expect(finish).toContain("textLength,");
    expect(finish).toContain("usedDictation,");
    expect(finish).toContain("mode,");
    expect(finish).toContain("didDraw: markCount > 0");
    expect(finish).not.toContain("drawingDataUrl");
    expect(finish).not.toContain("transcript");
    expect(finish).not.toContain("strokes");
  });
});
