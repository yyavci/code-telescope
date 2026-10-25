import type { ThemedToken } from "shiki";
import { describe, expect, it } from "vitest";
import { renderTokensWithMatch } from "../../../core/adapters/preview-renderer/buffer-preview.renderer-adapter";

const token = (content: string, color?: string) => ({ content, color, offset: 0 }) as ThemedToken;
const plain = (content: string) => `<span>${content}</span>`;
const colored = (content: string, color: string) => `<span style="color:${color};">${content}</span>`;
const match = (inner: string) => `<span class="preview-match">${inner}</span>`;

describe("renderTokensWithMatch", () => {
  it("splits a token around the match", () => {
    const html = renderTokensWithMatch([token("const foo = 1;")], { start: 6, end: 9 }, "preview-match");

    expect(html).toBe(plain("const ") + match(plain("foo")) + plain(" = 1;"));
  });

  it("wraps a match across tokens in a single span", () => {
    const tokens = [token("data", "#a"), token("."), token("Items", "#b"), token(";")];

    const html = renderTokensWithMatch(tokens, { start: 0, end: 10 }, "preview-match");

    expect(html).toBe(match(colored("data", "#a") + plain(".") + colored("Items", "#b")) + plain(";"));
  });

  it("handles a match that starts and ends on token edges", () => {
    const html = renderTokensWithMatch([token("ab"), token("cd"), token("ef")], { start: 2, end: 4 }, "preview-match");

    expect(html).toBe(plain("ab") + match(plain("cd")) + plain("ef"));
  });

  it("closes the match when the range runs past the line", () => {
    const html = renderTokensWithMatch([token("abc")], { start: 1, end: 50 }, "preview-match");

    expect(html).toBe(plain("a") + match(plain("bc")));
  });

  it("escapes token content", () => {
    const html = renderTokensWithMatch([token("<b>&")], { start: 0, end: 3 }, "preview-match");

    expect(html).toBe(match(plain("&lt;b&gt;")) + plain("&amp;"));
  });
});
