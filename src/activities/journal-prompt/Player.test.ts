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

  it("starts provenance empty, clears both contribution paths, and gates Done", () => {
    const clearDrawing = functionBody("clearDrawing", "changeText");
    const clearIdea = functionBody("clearIdea", "finish");

    expect(source).toContain("createJournalTextState()");
    expect(source).toContain("const textLength = contributedTextLength(textState)");
    expect(source).toContain("{parsed.sentenceStarter}");
    expect(clearDrawing).toContain("setMarkCount(0)");
    expect(clearIdea).toContain("setTextState(empty)");
    expect(source).toContain("disabled={!canFinish}");
  });

  it("labels frames as scaffold and learner insertions by their actual source", () => {
    const insertChunk = functionBody("insertChunk", "insertFrame");
    const insertFrame = functionBody("insertFrame", "toggleDictation");
    const toggleDictation = functionBody("toggleDictation", "currentTextState");

    expect(insertFrame).toContain('"scaffold"');
    expect(insertChunk).toContain('"word-bank"');
    expect(toggleDictation).toContain('"dictation"');
  });

  it("restores insertion selection during commit so it cannot override newer caret work", () => {
    const restoreSelection = functionBody("restoreSelection", "insertChunk");
    expect(source).toContain("useLayoutEffect(() => {");
    expect(source).toContain("pendingSelectionRef.current = null");
    expect(restoreSelection).toContain("pendingSelectionRef.current =");
    expect(restoreSelection).not.toContain("requestAnimationFrame");
  });

  it("submits only the bounded summary fields", () => {
    const finish = functionBody("finish", "ComposeView");
    expect(finish).toContain("markCount,");
    expect(finish).toContain("textLength,");
    expect(finish).toContain("usedDictation: dictatedTextRemains,");
    expect(finish).toContain("mode,");
    expect(finish).toContain("didDraw: markCount > 0");
    expect(finish).not.toContain("drawingDataUrl");
    expect(finish).not.toContain("transcript");
    expect(finish).not.toContain("strokes");
  });

  it("shows talk-to-write only for an opted-in account learner and keeps a text fallback", () => {
    expect(source).toContain("learnerContext");
    expect(source).toContain("micAllowed={learnerContext?.oralReading === true}");
    expect(source).toContain("const allowsDictation = micAllowed && config.allowModes.includes(\"dictate\")");
    expect(source).toContain("Talk to write is off. You can type or ask a grown-up to write.");
  });

  it("aborts active dictation and rejects late results when consent is revoked", () => {
    const toggleDictation = functionBody("toggleDictation", "currentTextState");
    expect(source).toContain("micAllowedRef.current = micAllowed");
    expect(source).toContain("if (!micAllowed) abortDictation()");
    expect(toggleDictation).toContain("if (!micAllowedRef.current) return");
  });
});
