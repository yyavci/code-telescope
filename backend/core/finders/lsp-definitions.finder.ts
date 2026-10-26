import { FuzzyFinderAdapter } from "../decorators/fuzzy-finder-provider.decorator";
import { LspLocationsFinder } from "./lsp-locations.finder";

@FuzzyFinderAdapter({
  fuzzy: "workspace.definitions",
  previewRenderer: "preview.buffer",
  dataAdapter: "workspaceReferencesAdapter",
  name: "Definitions",
  description: "Find definitions of the symbol at cursor",
})
export class DefinitionsFinder extends LspLocationsFinder {
  protected readonly locationCommand = "vscode.executeDefinitionProvider";
  protected readonly codicon = "symbol-method";
  protected readonly emptyMessage = "No definitions found";
}
