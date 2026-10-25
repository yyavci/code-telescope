import { describe, expect, it } from "vitest";
import { RipgrepArgsBuilder } from "../../../core/common/rg/ripgrep-args.builder";

describe("RipgrepArgsBuilder", () => {
  it("passes the query through --regexp so a leading dash is not parsed as a flag", () => {
    const args = new RipgrepArgsBuilder().query("--pre=cmd").build();

    const regexpIndex = args.indexOf("--regexp");
    expect(regexpIndex).toBeGreaterThanOrEqual(0);
    expect(args[regexpIndex + 1]).toBe("--pre=cmd");
    expect(args[0]).toBe("--regexp");
  });

  it("throws when the query is missing or defined twice", () => {
    expect(() => new RipgrepArgsBuilder().build()).toThrow("query is required");
    expect(() => new RipgrepArgsBuilder().query("a").query("b")).toThrow("query already defined");
  });

  it("keeps paths as the last positional arguments", () => {
    const args = new RipgrepArgsBuilder().query("foo").exclude(["**/bin/**"]).withPaths(["/a", "/b"]).build();

    expect(args.slice(-2)).toEqual(["/a", "/b"]);
  });

  it("adds settings excludes with a single leading !", () => {
    const args = new RipgrepArgsBuilder().query("foo").exclude(["**/bin/**", "!**/obj/**"]).build();

    expect(args.slice(args.indexOf("--glob"))).toEqual(["--glob", "!**/bin/**", "--glob", "!**/obj/**"]);
  });

  it("does not add case-insensitive globbing without user globs", () => {
    const args = new RipgrepArgsBuilder().query("foo").exclude(["**/bin/**"]).userGlobs([]).build();

    expect(args).not.toContain("--glob-case-insensitive");
  });

  it("adds case-insensitive globbing when user globs are present", () => {
    const args = new RipgrepArgsBuilder().query("foo").userGlobs(["*.cs"]).build();

    expect(args).toContain("--glob-case-insensitive");
    expect(args).toContain("*.cs");
  });

  it("puts user includes before user excludes, whatever the typed order", () => {
    const args = new RipgrepArgsBuilder().query("foo").userGlobs(["!*Test*.cs", "*.cs", "!*.g.cs", "*.vb"]).build();

    const globArgs = args.slice(args.indexOf("--glob-case-insensitive"));
    expect(globArgs).toEqual([
      "--glob-case-insensitive",
      "--glob",
      "*.cs",
      "--glob",
      "*.vb",
      "--glob",
      "!*Test*.cs",
      "--glob",
      "!*.g.cs",
    ]);
  });

  it("emits settings excludes after user globs, whatever the call order", () => {
    const args = new RipgrepArgsBuilder()
      .query("foo")
      .exclude(["**/bin/**"])
      .userGlobs(["*.cs", "!*Test*.cs"])
      .withPaths(["/root"])
      .build();

    expect(args.slice(args.indexOf("--glob-case-insensitive"))).toEqual([
      "--glob-case-insensitive",
      "--glob",
      "*.cs",
      "--glob",
      "!*Test*.cs",
      "--glob",
      "!**/bin/**",
      "/root",
    ]);
  });

  it("never emits --iglob, which would override the settings excludes", () => {
    const args = new RipgrepArgsBuilder().query("foo").userGlobs(["*.cs"]).exclude(["**/bin/**"]).build();

    expect(args).not.toContain("--iglob");
  });
});
