import { FuzzyFinderAdapter } from "../decorators/fuzzy-finder-provider.decorator";
import { LspLocationsFinder } from "./lsp-locations.finder";

@FuzzyFinderAdapter({
  fuzzy: "workspace.implementations",
  previewRenderer: "preview.buffer",
  dataAdapter: "workspaceReferencesAdapter",
  name: "Implementations",
  description: "Find implementations of the symbol at cursor",
})
export class ImplementationsFinder extends LspLocationsFinder {
  protected readonly locationCommand = "vscode.executeImplementationProvider";
  protected readonly codicon = "symbol-interface";
  protected readonly emptyMessage = "No implementations found";
  protected readonly jumpToSingleResult = true;
}
