export interface TextSearchData {
  results: TextSearchMatch[];
  query: string;
}

export interface TextSearchMatch {
  file: string;
  line: number;
  column: number;
  /** Length of the first match on the line, in characters */
  matchLength?: number;
  text: string;
  preview: string;
}
