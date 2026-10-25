import { IFuzzyFinderDataAdapter } from "../../../../shared/abstractions/fuzzy-finder-data-adapter";
import { DataAdapterType } from "../../../../shared/adapters-namespace";
import { WorkspaceSymbolData, WorkspaceSymbolFinderData } from "../../../../shared/exchange/ws-symbols";
import { escapeHtml, splitHighlightedHtml } from "../../../utils/html";
import { FuzzyFinderDataAdapter } from "../../decorators/fuzzy-data-adapter.decorator";

const CONTAINER_SEPARATOR = " ";
const PATH_SEPARATOR = " · ";

export interface WorkspaceSymbolOption {
  index: number;
  symbol: WorkspaceSymbolData;
  displayText: string;
}

@FuzzyFinderDataAdapter({
  type: "symbolsAdapter",
})
export class SymbolsFinderDataAdapter
  implements IFuzzyFinderDataAdapter<WorkspaceSymbolFinderData, WorkspaceSymbolOption>
{
  typeName: DataAdapterType;

  parseOptions(data: WorkspaceSymbolFinderData): WorkspaceSymbolOption[] {
    const options: WorkspaceSymbolOption[] = [];

    for (let i = 0; i < data.symbols.length; i++) {
      options.push({
        index: i,
        symbol: data.symbols[i],
        displayText: data.displayTexts[i],
      });
    }

    return options;
  }

  /**
   * Name and container. The file path is left out: the score engine favours matches after the
   * last `/`, which would rank and highlight path matches above symbol name matches.
   * Paths are still filterable with `-g` globs.
   */
  getSearchText(option: WorkspaceSymbolOption): string {
    const { name, containerName } = option.symbol;
    return containerName ? `${name}${CONTAINER_SEPARATOR}${containerName}` : name;
  }

  getGlobPath(option: WorkspaceSymbolOption): string {
    return option.symbol.relativePath ?? "";
  }

  /** Renders the name prominently and the container and path muted, like VS Code's symbol picker. */
  getHtmlWrapper(option: WorkspaceSymbolOption, highlightedContent: string): string {
    const { codicon, name, containerName, relativePath } = option.symbol;
    const [nameHtml, containerHtml] = splitHighlightedHtml(highlightedContent, name.length);
    const pathHtml = relativePath
      ? escapeHtml(`${containerName ? PATH_SEPARATOR : CONTAINER_SEPARATOR}${relativePath}`)
      : "";
    const detailsHtml = containerHtml + pathHtml;
    const detailsPart = detailsHtml ? `<span class="sk-muted">${detailsHtml}</span>` : "";
    return `<i class="codicon codicon-${codicon} file-icon sk-${codicon}"></i><span class="file-path">${nameHtml}${detailsPart}</span>`;
  }

  getSelectionValue(option: WorkspaceSymbolOption): string {
    // Document symbols have no identifier and are still looked up by index
    return option.symbol.identifier ?? option.index.toString();
  }
}
