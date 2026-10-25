import * as vscode from "vscode";
import { FromWebviewKindMessage } from "../../../../shared/extension-webview-protocol";
import { isChunkableProvider } from "../../abstractions/chunkable-provider";
import { IWebviewMessageHandler } from "../../abstractions/webview-message-handler";
import { ChunkStreamer } from "../../chunk-streamer";
import { WebviewMessageHandler } from "../../decorators/webview-message-handler.decorator";
import { FuzzyFinderPanelController } from "../fuzzy-panel.controller";
import { sendLoadingState } from "../loading-state";
import { PreviewRequestState } from "../preview-request-state";
import { WebviewController } from "../webview.controller";

let initialLoadSequence = 0;

@WebviewMessageHandler()
export class WebviewDOMReadyHandler implements IWebviewMessageHandler<"webviewDOMReady"> {
  readonly type = "webviewDOMReady";

  async handle(msg: Extract<FromWebviewKindMessage, { type: "webviewDOMReady" }>, wv: vscode.Webview) {
    PreviewRequestState.resetPreviewRequestId();

    const loadId = `initial-${++initialLoadSequence}`;
    await sendLoadingState(wv, true, "initial", loadId);
    try {
      await this.sendInitialOptions(wv);
    } finally {
      // Sent even for an empty list or a failed query, which post no option list at all
      await sendLoadingState(wv, false, "initial", loadId);
    }
  }

  /** Resolves once every option has been posted. Webview messages are handled concurrently, so awaiting blocks nothing. */
  private async sendInitialOptions(wv: vscode.Webview) {
    const provider = FuzzyFinderPanelController.instance!.provider;

    if (isChunkableProvider(provider) && typeof (provider as any).queryStream === "function") {
      const streamer = new ChunkStreamer([], {
        messageType: "optionList",
        fuzzyProviderType: provider.fuzzyAdapterType,
        dataAdapterType: provider.dataAdapterType,
        chunkSize: provider.chunkSize,
        mapChunk: provider.mapChunk.bind(provider),
        totalLimit: 0,
      });

      const gen = await (provider as any).queryStream();

      if (gen && typeof gen[Symbol.asyncIterator] === "function") {
        try {
          await streamer.streamFromGenerator(gen);
        } catch (err) {
          console.error("Erro no streaming do gerador:", err);
        }
        return;
      }
    }

    const allItems = await provider.querySelectableOptions();
    const totalLimit = Array.isArray(allItems) ? allItems.length : 0;

    if (isChunkableProvider(provider)) {
      const streamer = new ChunkStreamer(allItems, {
        messageType: "optionList",
        fuzzyProviderType: provider.fuzzyAdapterType,
        dataAdapterType: provider.dataAdapterType,
        chunkSize: provider.chunkSize,
        mapChunk: provider.mapChunk.bind(provider),
        totalLimit,
      });

      await streamer.streamConcurrently(provider.concurrency);
      return;
    }

    await WebviewController.sendMessage(wv, {
      type: "optionList",
      data: allItems,
      fuzzyProviderType: provider.fuzzyAdapterType,
      dataAdapterType: provider.dataAdapterType,
      totalLimit,
    });
  }
}
