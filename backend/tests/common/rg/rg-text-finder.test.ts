import { describe, expect, it, vi } from "vitest";
import { toCharacterRange } from "../../../core/common/rg/rg-text-finder";

vi.mock("@backend/core/common/rg/rg-availability", () => ({ RipgrepAvailability: {} }));

const byteOffset = (text: string, charIndex: number) => Buffer.byteLength(text.slice(0, charIndex), "utf8");

function rangeOf(line: string, match: string) {
  const start = line.indexOf(match);
  return toCharacterRange(line, { start: byteOffset(line, start), end: byteOffset(line, start + match.length) });
}

describe("toCharacterRange", () => {
  it("keeps ASCII offsets unchanged", () => {
    expect(rangeOf("const foo = 1;", "foo")).toEqual({ start: 6, end: 9 });
  });

  it("converts byte offsets on lines with Turkish characters", () => {
    const line = "çağrı = karmaKoli; // öğe";
    expect(rangeOf(line, "karmaKoli")).toEqual({ start: 8, end: 17 });
  });

  it("counts surrogate pairs as two characters like VS Code positions", () => {
    expect(rangeOf("😀 foo", "foo")).toEqual({ start: 3, end: 6 });
  });

  it("is not affected by a trailing CRLF", () => {
    expect(rangeOf("a foo\r\n", "foo")).toEqual({ start: 2, end: 5 });
  });

  it("returns an empty range without a submatch", () => {
    expect(toCharacterRange("foo")).toEqual({ start: 0, end: 0 });
  });
});
