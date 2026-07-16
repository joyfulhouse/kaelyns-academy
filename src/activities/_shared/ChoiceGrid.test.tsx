import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChoiceGrid } from "./ChoiceGrid";

function renderChoiceGrid(revealAnswer?: boolean): string {
  return renderToStaticMarkup(
    <ChoiceGrid
      choices={["cat", "cap"]}
      answerIndex={0}
      picked={1}
      onChoose={() => undefined}
      {...(revealAnswer === undefined ? {} : { revealAnswer })}
    />,
  );
}

describe("ChoiceGrid answer reveal", () => {
  it("keeps choices available and the answer hidden by default after a pick", () => {
    const markup = renderChoiceGrid();

    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain("bg-success/30");
  });

  it("reveals and locks the grid only when the caller opts in", () => {
    const markup = renderChoiceGrid(true);

    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain("bg-success/30");
  });
});
