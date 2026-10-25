import { describe, expect, it } from "vitest";
import { findSymbolNameRange } from "../../utils/symbol";

describe("findSymbolNameRange", () => {
  it("finds the name at or after the given character", () => {
    expect(findSymbolNameRange("User user = new User();", "User", 5)).toEqual({ start: 16, end: 20 });
  });

  it("falls back to the first occurrence before the given character", () => {
    expect(findSymbolNameRange("public class Foo", "Foo", 20)).toEqual({ start: 13, end: 16 });
  });

  it("falls back to the bare name when the server adds a signature", () => {
    expect(findSymbolNameRange("public User GetUser(int id)", "GetUser(int)", 0)).toEqual({ start: 12, end: 19 });
    expect(findSymbolNameRange("class List<T> {}", "List<T>", 0)).toEqual({ start: 6, end: 13 });
  });

  it("prefers a whole-word occurrence over a longer identifier", () => {
    expect(findSymbolNameRange("public UserId User { get; }", "User", 0)).toEqual({ start: 14, end: 18 });
  });

  it("falls back to a partial occurrence when there is no whole word", () => {
    expect(findSymbolNameRange("var UserIdx = 1;", "UserId", 0)).toEqual({ start: 4, end: 10 });
  });

  it("returns undefined when the name is not on the line", () => {
    expect(findSymbolNameRange("namespace App;", "UserService", 0)).toBeUndefined();
    expect(findSymbolNameRange("anything", "", 0)).toBeUndefined();
  });
});
