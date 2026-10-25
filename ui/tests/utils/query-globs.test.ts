import { describe, expect, it } from "vitest";
import { createGlobMatcher, parseProviderInput, parseQueryGlobs } from "../../utils/query-globs";

const matchesGlobs = (path: string, globs: string[]) => createGlobMatcher(globs)(path);

describe("parseQueryGlobs", () => {
  it("returns the input unchanged when there is no glob", () => {
    expect(parseQueryGlobs("repository")).toEqual({ query: "repository", globs: [] });
    expect(parseQueryGlobs("")).toEqual({ query: "", globs: [] });
  });

  it("does not trim the input when nothing is parsed", () => {
    expect(parseQueryGlobs("repository  ")).toEqual({ query: "repository  ", globs: [] });
  });

  it("parses a single trailing glob and drops the separating whitespace", () => {
    expect(parseQueryGlobs("repository -g *.cs")).toEqual({ query: "repository", globs: ["*.cs"] });
    expect(parseQueryGlobs("repository   -g   *.cs  ")).toEqual({ query: "repository", globs: ["*.cs"] });
  });

  it("keeps typed order for multiple globs", () => {
    expect(parseQueryGlobs("repository -g *.cs -g !*Test*.cs")).toEqual({
      query: "repository",
      globs: ["*.cs", "!*Test*.cs"],
    });
  });

  it("supports a glob-only input", () => {
    expect(parseQueryGlobs("-g *.cs")).toEqual({ query: "", globs: ["*.cs"] });
    expect(parseQueryGlobs("-g *.cs -g !bin/**")).toEqual({ query: "", globs: ["*.cs", "!bin/**"] });
  });

  it("strips a trailing bare -g without adding a glob", () => {
    expect(parseQueryGlobs("repository -g")).toEqual({ query: "repository", globs: [] });
    expect(parseQueryGlobs("repository -g ")).toEqual({ query: "repository", globs: [] });
    expect(parseQueryGlobs("repository -g *.cs -g")).toEqual({ query: "repository", globs: ["*.cs"] });
    expect(parseQueryGlobs("-g")).toEqual({ query: "", globs: [] });
  });

  it("keeps the globs while the next flag is being typed", () => {
    expect(parseQueryGlobs("repository -g *.cs -")).toEqual({ query: "repository", globs: ["*.cs"] });
    expect(parseQueryGlobs("repository -g *.cs - ")).toEqual({ query: "repository", globs: ["*.cs"] });
    expect(parseQueryGlobs("-g *.cs -")).toEqual({ query: "", globs: ["*.cs"] });
  });

  it("keeps a lone trailing dash when no glob is parsed", () => {
    expect(parseQueryGlobs("foo -")).toEqual({ query: "foo -", globs: [] });
    expect(parseQueryGlobs("-")).toEqual({ query: "-", globs: [] });
    expect(parseQueryGlobs("gcc -g -O2 -")).toEqual({ query: "gcc -g -O2 -", globs: [] });
  });

  it("does not parse a value that starts with a dash", () => {
    expect(parseQueryGlobs("gcc -g -O2")).toEqual({ query: "gcc -g -O2", globs: [] });
    expect(parseQueryGlobs("foo -g *.cs -g -O2")).toEqual({ query: "foo -g *.cs -g -O2", globs: [] });
  });

  it("keeps -g in the query when it is not trailing", () => {
    expect(parseQueryGlobs("foo -g *.cs bar")).toEqual({ query: "foo -g *.cs bar", globs: [] });
  });

  it("only treats -g as a flag when it is a standalone token", () => {
    expect(parseQueryGlobs("foo-g *.cs")).toEqual({ query: "foo-g *.cs", globs: [] });
    expect(parseQueryGlobs("foo -gx")).toEqual({ query: "foo -gx", globs: [] });
  });

  it("unescapes \\-g and never parses it as a flag", () => {
    expect(parseQueryGlobs("gcc \\-g")).toEqual({ query: "gcc -g", globs: [] });
    expect(parseQueryGlobs("\\-g foo")).toEqual({ query: "-g foo", globs: [] });
    expect(parseQueryGlobs("gcc \\-g -g *.c")).toEqual({ query: "gcc -g", globs: ["*.c"] });
  });

  it("leaves \\-g inside a larger token alone", () => {
    expect(parseQueryGlobs("foo\\-g")).toEqual({ query: "foo\\-g", globs: [] });
  });
});

describe("parseProviderInput", () => {
  it("parses globs for supported providers", () => {
    expect(parseProviderInput("foo -g *.cs", "workspace.text")).toEqual({ query: "foo", globs: ["*.cs"] });
  });

  it("parses globs only for the workspace files and text finders", () => {
    expect(parseProviderInput("foo -g *.cs", "workspace.files").globs).toEqual(["*.cs"]);
    expect(parseProviderInput("foo -g *.cs", "workspace.text").globs).toEqual(["*.cs"]);
    expect(parseProviderInput("foo -g *.cs", "git.branches").globs).toEqual([]);
  });

  it("passes the raw input through for unsupported providers", () => {
    expect(parseProviderInput("foo -g *.cs", "currentFile.text")).toEqual({ query: "foo -g *.cs", globs: [] });
  });
});

describe("matchesGlobs", () => {
  it("accepts every path when there are no globs", () => {
    expect(matchesGlobs("src/a.cs", [])).toBe(true);
  });

  it("matches a glob without slash against the basename at any depth", () => {
    expect(matchesGlobs("src/deep/a.cs", ["*.cs"])).toBe(true);
    expect(matchesGlobs("a.cs", ["*.cs"])).toBe(true);
    expect(matchesGlobs("src/a.ts", ["*.cs"])).toBe(false);
    expect(matchesGlobs("a.cs/readme.md", ["*.cs"])).toBe(false);
  });

  it("matches a glob with slash against the whole relative path", () => {
    expect(matchesGlobs("src/a.cs", ["src/*.cs"])).toBe(true);
    expect(matchesGlobs("src/deep/a.cs", ["src/*.cs"])).toBe(false);
    expect(matchesGlobs("lib/src/a.cs", ["src/*.cs"])).toBe(false);
  });

  it("strips a leading slash from the glob", () => {
    expect(matchesGlobs("src/a.cs", ["/src/*.cs"])).toBe(true);
    expect(matchesGlobs("lib/src/a.cs", ["/src/*.cs"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matchesGlobs("src/Program.CS", ["*.cs"])).toBe(true);
    expect(matchesGlobs("SRC/a.cs", ["src/*.cs"])).toBe(true);
  });

  it("normalizes backslashes in the path", () => {
    expect(matchesGlobs("src\\deep\\a.cs", ["src/**/*.cs"])).toBe(true);
    expect(matchesGlobs("src\\a.cs", ["src/*.cs"])).toBe(true);
  });

  it("supports ? as a single non-slash character", () => {
    expect(matchesGlobs("a1.cs", ["a?.cs"])).toBe(true);
    expect(matchesGlobs("a12.cs", ["a?.cs"])).toBe(false);
    expect(matchesGlobs("src/a.cs", ["src?a.cs"])).toBe(false);
  });

  it("does not let * cross directory separators", () => {
    expect(matchesGlobs("src/deep/a.cs", ["src/*"])).toBe(false);
    expect(matchesGlobs("src/a.cs", ["src/*"])).toBe(true);
  });

  it("handles ** in leading, middle and trailing positions", () => {
    expect(matchesGlobs("a.cs", ["**/*.cs"])).toBe(true);
    expect(matchesGlobs("x/y/a.cs", ["**/*.cs"])).toBe(true);
    expect(matchesGlobs("src/a/b/c.cs", ["src/**/c.cs"])).toBe(true);
    expect(matchesGlobs("src/c.cs", ["src/**/c.cs"])).toBe(true);
    expect(matchesGlobs("src/a/b.cs", ["src/**"])).toBe(true);
    expect(matchesGlobs("lib/a/b.cs", ["src/**"])).toBe(false);
    expect(matchesGlobs("src/a/b.cs", ["**"])).toBe(true);
  });

  it("supports {a,b} alternation", () => {
    expect(matchesGlobs("a.cs", ["*.{cs,ts}"])).toBe(true);
    expect(matchesGlobs("a.ts", ["*.{cs,ts}"])).toBe(true);
    expect(matchesGlobs("a.js", ["*.{cs,ts}"])).toBe(false);
    expect(matchesGlobs("a.tsx", ["*.{cs,ts{,x}}"])).toBe(true);
  });

  it("supports [...] classes and [!...] negation", () => {
    expect(matchesGlobs("a1.cs", ["a[0-9].cs"])).toBe(true);
    expect(matchesGlobs("ab.cs", ["a[0-9].cs"])).toBe(false);
    expect(matchesGlobs("ab.cs", ["a[!0-9].cs"])).toBe(true);
    expect(matchesGlobs("a1.cs", ["a[!0-9].cs"])).toBe(false);
  });

  it("accepts [^...] as negation like [!...]", () => {
    expect(matchesGlobs("ab.cs", ["a[^0-9].cs"])).toBe(true);
    expect(matchesGlobs("a1.cs", ["a[^0-9].cs"])).toBe(false);
  });

  it("matches nothing when any glob is invalid, like ripgrep", () => {
    expect(matchesGlobs("az.cs", ["a[z-a].cs"])).toBe(false);
    expect(matchesGlobs("az.cs", ["!a[z-a].cs"])).toBe(false);
    expect(matchesGlobs("a.cs", ["a[z-a].cs", "*.cs"])).toBe(false);
  });

  it("collapses redundant wildcards", () => {
    expect(matchesGlobs("src/a/b.cs", ["src/***/b.cs"])).toBe(true);
    expect(matchesGlobs("src/a/b/c.cs", ["src/**/**/c.cs"])).toBe(true);
    expect(matchesGlobs("src/c.cs", ["src/**/**/c.cs"])).toBe(true);
  });

  it("treats an unclosed { or [ as a literal character", () => {
    expect(matchesGlobs("a{b.cs", ["a{b.cs"])).toBe(true);
    expect(matchesGlobs("ab.cs", ["a{b.cs"])).toBe(false);
    expect(matchesGlobs("a[b.cs", ["a[b.cs"])).toBe(true);
    expect(matchesGlobs("ab.cs", ["a[b.cs"])).toBe(false);
  });

  it("escapes regex metacharacters", () => {
    expect(matchesGlobs("a+b(1).cs", ["a+b(1).cs"])).toBe(true);
    expect(matchesGlobs("aab(1).cs", ["a+b(1).cs"])).toBe(false);
    expect(matchesGlobs("axcs", ["a.cs"])).toBe(false);
  });

  it("requires at least one include to match", () => {
    expect(matchesGlobs("a.cs", ["*.cs", "*.ts"])).toBe(true);
    expect(matchesGlobs("a.ts", ["*.cs", "*.ts"])).toBe(true);
    expect(matchesGlobs("a.js", ["*.cs", "*.ts"])).toBe(false);
  });

  it("rejects paths that match an exclude, whatever the typed order", () => {
    expect(matchesGlobs("a.cs", ["*.cs", "!*Test*.cs"])).toBe(true);
    expect(matchesGlobs("ATest.cs", ["*.cs", "!*Test*.cs"])).toBe(false);
    expect(matchesGlobs("ATest.cs", ["!*Test*.cs", "*.cs"])).toBe(false);
  });

  it("treats excludes alone as 'everything except'", () => {
    expect(matchesGlobs("a.cs", ["!*.cs"])).toBe(false);
    expect(matchesGlobs("a.ts", ["!*.cs"])).toBe(true);
    expect(matchesGlobs("bin/a.ts", ["!bin/**"])).toBe(false);
  });
});

describe("createGlobMatcher", () => {
  it("returns a reusable predicate", () => {
    const matcher = createGlobMatcher(["*.cs", "!*Test*.cs"]);
    expect(matcher("a.cs")).toBe(true);
    expect(matcher("aTest.cs")).toBe(false);
    expect(matcher("a.ts")).toBe(false);
    expect(matcher("b.cs")).toBe(true);
  });
});
