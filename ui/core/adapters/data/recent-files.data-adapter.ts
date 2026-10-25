import { IFuzzyFinderDataAdapter } from "../../../../shared/abstractions/fuzzy-finder-data-adapter";
import { DataAdapterType } from "../../../../shared/adapters-namespace";
import { RecentFileData, RecentFilesFinderData } from "../../../../shared/exchange/recent-files";
import { formatFileOptionHtml, formatFilePathHtml } from "../../../utils/html";
import { getSvgIconUrl } from "../../../utils/icon";
import { FuzzyFinderDataAdapter } from "../../decorators/fuzzy-data-adapter.decorator";

export interface RecentFileOption {
  index: number;
  file: RecentFileData;
  displayText: string;
}

@FuzzyFinderDataAdapter({
  type: "workspaceRecentFilesAdapter",
})
export class RecentFilesFinderDataAdapter implements IFuzzyFinderDataAdapter<RecentFilesFinderData, RecentFileOption> {
  typeName: DataAdapterType;
  searchTextIsPath = true;

  parseOptions(data: RecentFilesFinderData): RecentFileOption[] {
    const options: RecentFileOption[] = [];

    for (let i = 0; i < data.files.length; i++) {
      options.push({
        index: i,
        file: data.files[i],
        displayText: data.displayTexts[i],
      });
    }

    return options;
  }

  getSearchText(option: RecentFileOption): string {
    return option.file.relativePath;
  }

  /** Terminals have no file path, so include globs hide them and exclude globs keep them. */
  getGlobPath(option: RecentFileOption): string {
    return option.file.kind === "terminal" ? "" : option.file.relativePath;
  }

  getHtmlWrapper(option: RecentFileOption, highlightedContent: string): string {
    if (option.file.kind === "terminal") {
      return `<i class="codicon codicon-terminal file-icon"></i><span class="file-path">${highlightedContent}</span>`;
    }

    const svgIconUrl = getSvgIconUrl(option.file.path);
    return formatFileOptionHtml(svgIconUrl, formatFilePathHtml(option.file.relativePath, highlightedContent));
  }

  getSelectionValue(option: RecentFileOption): string {
    return option.file.path;
  }
}
