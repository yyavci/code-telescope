import { FuzzyFinderAdapter } from "../decorators/fuzzy-finder-provider.decorator";
import { LspLocationsFinder } from "./lsp-locations.finder";

@FuzzyFinderAdapter({
  fuzzy: "workspace.typeDefinitions",
  previewRenderer: "preview.buffer",
  dataAdapter: "workspaceReferencesAdapter",
  name: "Type Definitions",
  description: "Find the type definition of the symbol at cursor",
})
export class TypeDefinitionsFinder extends LspLocationsFinder {
  protected readonly locationCommand = "vscode.executeTypeDefinitionProvider";
  protected readonly codicon = "symbol-class";
  protected readonly emptyMessage = "No type definitions found";
}
