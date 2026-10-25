import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { FuzzyFinderPanelController } from "../../../core/presentation/fuzzy-panel.controller";
import { DynamicSearchHandler } from "../../../core/presentation/handlers/dynamic-search.handler";
import { WebviewController } from "../../../core/presentation/webview.controller";

vi.mock("@backend/core/presentation/fuzzy-panel.controller", () => ({
  FuzzyFinderPanelController: {
    instance: {
      provider: {
        supportsDynamicSearch: true,
        searchOnDynamicMode: vi.fn(),
        fuzzyAdapterType: "workspace.text",
      },
    },
  },
}));

vi.mock("@backend/core/presentation/webview.controller", () => ({
  WebviewController: {
    sendMessage: vi.fn(),
  },
}));

describe("DynamicSearchHandler", () => {
  let handler: DynamicSearchHandler;
  let webview: vscode.Webview;

  beforeEach(() => {
    handler = new DynamicSearchHandler();
    webview = {} as vscode.Webview;
    vi.clearAllMocks();
  });

  it("should call dynamic search and send option list", async () => {
    const providerMock = FuzzyFinderPanelController.instance!.provider;
    const dynSearchResult = {
      results: ["a", "b"],
      query: "te",
    };
    const query = "te";

    vi.mocked(providerMock.searchOnDynamicMode!).mockResolvedValue(dynSearchResult);

    await handler.handle(
      {
        type: "dynamicSearch",
        query,
      } as any,
      webview,
    );

    expect(providerMock.searchOnDynamicMode).toHaveBeenCalledWith(query);

    expect(WebviewController.sendMessage).toHaveBeenCalledWith(webview, {
      type: "optionList",
      data: dynSearchResult,
      fuzzyProviderType: providerMock.fuzzyAdapterType,
      totalLimit: dynSearchResult.results.length,
      query,
    });
  });

  it("should forward globs to the streaming search", async () => {
    const providerMock = FuzzyFinderPanelController.instance!.provider as any;
    const searchOnDynamicModeStream = vi.fn(async function* () {
      yield ["match"];
    });
    providerMock.chunkSize = 10;
    providerMock.mapChunk = vi.fn((chunk: any[]) => ({ results: chunk }));
    providerMock.searchOnDynamicModeStream = searchOnDynamicModeStream;

    try {
      await handler.handle(
        { type: "dynamicSearch", query: "te", globs: ["*.cs", "!*Test*.cs"], requestId: "request-1" } as any,
        webview,
      );
    } finally {
      delete providerMock.chunkSize;
      delete providerMock.mapChunk;
      delete providerMock.searchOnDynamicModeStream;
    }

    expect(searchOnDynamicModeStream).toHaveBeenCalledWith("te", undefined, expect.any(AbortSignal), [
      "*.cs",
      "!*Test*.cs",
    ]);
  });

  it("wraps the search in loading state messages for its request", async () => {
    const providerMock = FuzzyFinderPanelController.instance!.provider;
    vi.mocked(providerMock.searchOnDynamicMode!).mockResolvedValue({ results: [], query: "te" });

    await handler.handle({ type: "dynamicSearch", query: "te", requestId: "request-1" } as any, webview);

    const sent = vi.mocked(WebviewController.sendMessage).mock.calls.map(([, msg]) => msg);
    expect(sent[0]).toEqual({ type: "loadingState", loading: true, scope: "search", id: "request-1" });
    expect(sent.at(-1)).toEqual({ type: "loadingState", loading: false, scope: "search", id: "request-1" });
  });

  it("should do nothing if provider does not support dynamic search", async () => {
    const providerMock = FuzzyFinderPanelController.instance!.provider;
    providerMock.supportsDynamicSearch = false;

    await handler.handle(
      {
        type: "dynamicSearch",
        query: "test",
      } as any,
      webview,
    );

    expect(WebviewController.sendMessage).not.toHaveBeenCalled();
  });
});
