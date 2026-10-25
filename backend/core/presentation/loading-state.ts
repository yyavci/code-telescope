import * as vscode from "vscode";
import { LoadingStateMessage } from "../../../shared/extension-webview-protocol";
import { Logger } from "../log";
import { WebviewController } from "./webview.controller";

/**
 * Tells the webview that options start or stop loading, so it can show a progress bar.
 * A failed send only means the panel was closed meanwhile, so it is logged instead of thrown.
 */
export async function sendLoadingState(
  wv: vscode.Webview,
  loading: boolean,
  scope: LoadingStateMessage["scope"],
  id: string,
): Promise<void> {
  try {
    await WebviewController.sendMessage(wv, { type: "loadingState", loading, scope, id });
  } catch (error) {
    Logger.warn(`[LoadingState] Could not send loading=${loading} for ${scope} ${id}: ${error}`);
  }
}
