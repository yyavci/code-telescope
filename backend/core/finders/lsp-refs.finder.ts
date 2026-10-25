import { FuzzyFinderAdapter } from "../decorators/fuzzy-finder-provider.decorator";
import { LspLocationsFinder } from "./lsp-locations.finder";

@FuzzyFinderAdapter({
  fuzzy: "workspace.references",
  previewRenderer: "preview.buffer",
  dataAdapter: "workspaceReferencesAdapter",
  name: "References",
  description: "Find all references to the symbol at cursor",
})
export class ReferencesFinder extends LspLocationsFinder {
  protected readonly locationCommand = "vscode.executeReferenceProvider";
  protected readonly codicon = "references";
  protected readonly emptyMessage = "No references found";
}
