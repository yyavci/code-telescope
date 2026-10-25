import { IFuzzyFinderDataAdapter } from "../../../../shared/abstractions/fuzzy-finder-data-adapter";
import { DataAdapterType } from "../../../../shared/adapters-namespace";
import { TextSearchData } from "../../../../shared/exchange/workspace-text-search";
import { formatFileOptionHtml, splitHighlightedHtml } from "../../../utils/html";
import { getSvgIconUrl } from "../../../utils/icon";
import { FuzzyFinderDataAdapter } from "../../decorators/fuzzy-data-adapter.decorator";

interface SearchOption {
  identifier: string;
  file: string;
  line: number;
  preview: string;
}

@FuzzyFinderDataAdapter({
  type: "textSearchAdapter",
})
export class TextFinderDataAdapter implements IFuzzyFinderDataAdapter<TextSearchData, SearchOption> {
  typeName: DataAdapterType;
  debounceSearchTime = 150;

  parseOptions(data: TextSearchData): SearchOption[] {
    return data.results.map((match) => ({
      identifier: [match.file, match.line, match.column, match.matchLength]
        .filter((part) => part !== undefined)
        .join("||"),
      file: match.file,
      line: match.line,
      preview: match.preview,
    }));
  }

  getSearchText(option: SearchOption): string {
    return `${this.getLocationPrefix(option)}${option.preview}`;
  }

  /** Mutes the `file:line` prefix so the matched code stands out. */
  getHtmlWrapper(option: SearchOption, highlightedContent: string): string {
    const svgIconUrl = getSvgIconUrl(option.file);
    const [prefixHtml, previewHtml] = splitHighlightedHtml(highlightedContent, this.calcHlOffsetChars(option));
    return formatFileOptionHtml(svgIconUrl, `<span class="sk-muted">${prefixHtml}</span>${previewHtml}`);
  }

  getSelectionValue(option: SearchOption): string {
    return option.identifier;
  }

  /** Highlights only the preview, the query was searched in the file content and not in its name. */
  calcHlOffsetChars(option: SearchOption): number {
    return this.getLocationPrefix(option).length;
  }

  private getLocationPrefix(option: SearchOption): string {
    return `${this.getFileName(option.file)}:${option.line} `;
  }

  private getFileName(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  }
}
