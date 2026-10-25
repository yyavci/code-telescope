import { afterEach, describe, expect, it, vi } from "vitest";
import { fileNameFirstHtml, formatFilePathHtml, muteDirectoryHtml, splitHighlightedHtml } from "../../utils/html";

const hl = (char: string) => `<span class="highlight">${char}</span>`;
const fileNameFirst = (fileName: string, directory: string) =>
  `<span class="sk-path-filename-first"><span class="sk-path-file">${fileName}</span>` +
  `<span class="sk-muted sk-path-directory">&lrm;${directory}&lrm;</span></span>`;

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

describe("fileNameFirstHtml", () => {
  it("puts the file name before the muted directory without its trailing separator", () => {
    expect(fileNameFirstHtml("src/deep/a.cs", `src/deep/${hl("a")}.cs`)).toBe(
      fileNameFirst(`${hl("a")}.cs`, "src/deep"),
    );
  });

  it("keeps highlights inside the directory", () => {
    expect(fileNameFirstHtml("src/a.cs", `${hl("s")}rc/a.cs`)).toBe(fileNameFirst("a.cs", `${hl("s")}rc`));
  });

  it("supports windows separators", () => {
    expect(fileNameFirstHtml("src\\a.cs", "src\\a.cs")).toBe(fileNameFirst("a.cs", "src"));
  });

  it("returns the html unchanged without a directory", () => {
    expect(fileNameFirstHtml("a.cs", "a.cs")).toBe("a.cs");
  });

  it("drops a highlighted separator", () => {
    expect(fileNameFirstHtml("src/a.cs", `src${hl("/")}a.cs`)).toBe(fileNameFirst("a.cs", "src"));
  });

  it("counts entities as one character", () => {
    expect(fileNameFirstHtml("a&b/c&d.cs", `a&amp;${hl("b")}/c${hl("&amp;")}d.cs`)).toBe(
      fileNameFirst(`c${hl("&amp;")}d.cs`, `a&amp;${hl("b")}`),
    );
  });

  it("omits the directory span for a file at the filesystem root", () => {
    expect(fileNameFirstHtml("/a.cs", "/a.cs")).toBe("a.cs");
  });
});

describe("formatFilePathHtml", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts the file name first for the filename-first display", () => {
    vi.stubGlobal("__FILE_PATH_DISPLAY__", "filename-first");

    expect(formatFilePathHtml("src/a.cs", "src/a.cs")).toBe(fileNameFirst("a.cs", "src"));
  });

  it("mutes the directory in place for the relative display", () => {
    vi.stubGlobal("__FILE_PATH_DISPLAY__", "relative");

    expect(formatFilePathHtml("src/a.cs", "src/a.cs")).toBe(`<span class="sk-muted">src/</span>a.cs`);
  });
});
