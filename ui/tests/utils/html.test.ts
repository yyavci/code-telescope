import { describe, expect, it } from "vitest";
import { muteDirectoryHtml, splitHighlightedHtml } from "../../utils/html";

const hl = (char: string) => `<span class="highlight">${char}</span>`;

describe("splitHighlightedHtml", () => {
  it("splits plain text at the given character", () => {
    expect(splitHighlightedHtml("UserService App", 11)).toEqual(["UserService", " App"]);
  });

  it("counts highlight spans and entities as one character", () => {
    const html = `${hl("a")}&amp;b${hl("&lt;")}c`;

    expect(splitHighlightedHtml(html, 2)).toEqual([`${hl("a")}&amp;`, `b${hl("&lt;")}c`]);
    expect(splitHighlightedHtml(html, 3)).toEqual([`${hl("a")}&amp;b`, `${hl("&lt;")}c`]);
  });

  it("handles out of range indexes", () => {
    expect(splitHighlightedHtml("abc", 0)).toEqual(["", "abc"]);
    expect(splitHighlightedHtml("abc", 10)).toEqual(["abc", ""]);
  });
});

describe("muteDirectoryHtml", () => {
  it("wraps the directory part and keeps the file name", () => {
    expect(muteDirectoryHtml("src/a.cs", `src/${hl("a")}.cs`)).toBe(`<span class="sk-muted">src/</span>${hl("a")}.cs`);
  });

  it("supports windows separators", () => {
    expect(muteDirectoryHtml("src\\a.cs", "src\\a.cs")).toBe(`<span class="sk-muted">src\\</span>a.cs`);
  });

  it("returns the html unchanged without a directory", () => {
    expect(muteDirectoryHtml("a.cs", "a.cs")).toBe("a.cs");
  });
});
