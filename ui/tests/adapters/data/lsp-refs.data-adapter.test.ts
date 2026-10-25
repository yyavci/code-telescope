import { describe, expect, it } from "vitest";
import { ReferenceFinderData } from "../../../../shared/exchange/lsp-refs";
import { ReferencesFinderDataAdapter } from "../../../core/adapters/data/lsp-refs.data-adapter";

describe("ReferencesFinderDataAdapter", () => {
  const adapter = new ReferencesFinderDataAdapter();

  const data = {
    references: [{ index: 2500, relativePath: "src/app.ts", line: 3, preview: "  target();", symbolName: "target" }],
    displayTexts: [""],
    currentSymbol: "target",
  } as unknown as ReferenceFinderData;
  const option = adapter.parseOptions(data)[0];

  it("selects by the backend index, not the position in the chunk", () => {
    expect(adapter.getSelectionValue(option)).toBe("2500");
  });

  it("matches globs against the relative path", () => {
    expect(adapter.getGlobPath(option)).toBe("src/app.ts");
  });

  it("mutes the path and keeps the preview prominent", () => {
    const html = adapter.getHtmlWrapper(option, adapter.getSearchText(option));

    expect(html).toContain(`<span class="sk-muted">src/app.ts</span> target();`);
  });
});
