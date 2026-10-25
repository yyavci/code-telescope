import { beforeEach, describe, expect, it, type Mocked, vi } from "vitest";
import * as vscode from "vscode";
import { RipgrepTextFinder } from "../../../core/common/rg/rg-text-finder";
import { WorkspaceTextSearchProvider } from "../../../core/finders/ws-text-finder/index.finder";
import { RegexFinder } from "../../../core/finders/ws-text-finder/regex-finder";

vi.mock("@backend/core/common/cache/file-reader", () => ({
  FileReader: {
    read: vi.fn(),
  },
}));

vi.mock("@backend/core/common/file-reader", () => ({
  FileReader: {
    read: vi.fn().mockResolvedValue("line one\nconst value = 42;"),
  },
}));

vi.mock("@backend/core/finders/ws-text-finder/regex-finder", () => {
  const RegexFinder = vi.fn(
    class MockClass {
      search = vi.fn();
    },
  );
  return { RegexFinder };
});

vi.mock("@backend/core/common/rg/rg-text-finder", () => {
  const RipgrepTextFinder = vi.fn(
    class MockClass {
      ripgrepAvailable = true;
      search = vi.fn();
      searchStream = vi.fn();
    },
  );
  return { RipgrepTextFinder };
});

describe("WorkspaceTextSearchProvider", () => {
  let provider: WorkspaceTextSearchProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new WorkspaceTextSearchProvider();
  });

  it("returns initial selectable options", async () => {
    const result = await provider.querySelectableOptions();
    expect(result).toEqual([]);
  });

  it("uses ripgrep when available", async () => {
    const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;

    rgInstance.search.mockResolvedValueOnce({ results: ["match"] } as any);

    const result = await provider.searchOnDynamicMode("test");

    expect(rgInstance.search).toHaveBeenCalledWith("test", undefined);
    expect(result.results).toEqual(["match"]);
  });

  it("falls back to regex finder when ripgrep fails", async () => {
    const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;
    const regexInstance = vi.mocked(RegexFinder).mock.results[0].value as Mocked<RegexFinder>;

    rgInstance.search.mockRejectedValueOnce(new Error("rg error"));
    regexInstance.search.mockResolvedValueOnce({ results: ["fallback"] });

    const result = await provider.searchOnDynamicMode("test");

    expect(regexInstance.search).toHaveBeenCalledWith("test");
    expect(result.results).toEqual(["fallback"]);
  });

  describe("searchOnDynamicModeStream", () => {
    async function collect(stream: AsyncGenerator<any[]>) {
      const chunks: any[][] = [];
      for await (const chunk of stream) chunks.push(chunk);
      return chunks;
    }

    async function* failingStream(): AsyncGenerator<any[]> {
      throw new Error("error parsing glob '*.{cs'");
    }

    it("forwards globs to ripgrep", async () => {
      const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;
      rgInstance.searchStream.mockImplementation(async function* () {
        yield ["match"] as any;
      });
      const signal = new AbortController().signal;

      const chunks = await collect(provider.searchOnDynamicModeStream("test", undefined, signal, ["*.cs"]));

      expect(rgInstance.searchStream).toHaveBeenCalledWith("test", undefined, signal, ["*.cs"]);
      expect(chunks).toEqual([["match"]]);
    });

    it("falls back to regex finder when ripgrep fails without globs", async () => {
      const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;
      const regexInstance = vi.mocked(RegexFinder).mock.results[0].value as Mocked<RegexFinder>;
      rgInstance.searchStream.mockImplementation(failingStream);
      regexInstance.search.mockResolvedValueOnce({ results: ["fallback"] });

      const chunks = await collect(provider.searchOnDynamicModeStream("test"));

      expect(chunks).toEqual([["fallback"]]);
    });

    it("does not fall back to regex finder when ripgrep fails with globs", async () => {
      const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;
      const regexInstance = vi.mocked(RegexFinder).mock.results[0].value as Mocked<RegexFinder>;
      rgInstance.searchStream.mockImplementation(failingStream);

      const chunks = await collect(provider.searchOnDynamicModeStream("test", undefined, undefined, ["*.{cs"]));

      expect(chunks).toEqual([]);
      expect(regexInstance.search).not.toHaveBeenCalled();
    });

    it("does not fall back to regex finder when ripgrep is unavailable and globs are set", async () => {
      const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;
      const regexInstance = vi.mocked(RegexFinder).mock.results[0].value as Mocked<RegexFinder>;
      (rgInstance as any).ripgrepAvailable = false;

      const chunks = await collect(provider.searchOnDynamicModeStream("test", undefined, undefined, ["*.cs"]));

      expect(chunks).toEqual([]);
      expect(rgInstance.searchStream).not.toHaveBeenCalled();
      expect(regexInstance.search).not.toHaveBeenCalled();
    });

    it("uses the regex finder when ripgrep is unavailable and there are no globs", async () => {
      const rgInstance = vi.mocked(RipgrepTextFinder).mock.results[0].value as Mocked<RipgrepTextFinder>;
      const regexInstance = vi.mocked(RegexFinder).mock.results[0].value as Mocked<RegexFinder>;
      (rgInstance as any).ripgrepAvailable = false;
      regexInstance.search.mockResolvedValueOnce({ results: ["fallback"] });

      const chunks = await collect(provider.searchOnDynamicModeStream("test"));

      expect(chunks).toEqual([["fallback"]]);
    });
  });

  it("opens file and reveals position on select", async () => {
    await provider.onSelect("/tmp/file.ts:3:5");

    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  describe("getPreviewData", () => {
    it("marks the match range on the highlighted line", async () => {
      const result = await provider.getPreviewData("/tmp/file.ts||2||7||5");

      expect(result.metadata).toMatchObject({ highlightLine: 1, highlightRange: { start: 6, end: 11 } });
    });

    it("omits the range for identifiers without a match length", async () => {
      const result = await provider.getPreviewData("/tmp/file.ts||2||7");

      expect(result.metadata).toMatchObject({ highlightLine: 1, highlightRange: undefined });
    });
  });
});
