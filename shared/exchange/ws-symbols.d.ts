export interface WorkspaceSymbolData {
  name: string;
  containerName: string;
  kindName: string;
  codicon: string;
  /** Workspace symbols only: `uri||line||character`, used for selection and preview without re-querying */
  identifier?: string;
  /** Workspace symbols only: workspace-relative file path, used for `-g` glob filters */
  relativePath?: string;
}

export interface WorkspaceSymbolFinderData {
  symbols: WorkspaceSymbolData[];
  displayTexts: string[];
}
