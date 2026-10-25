export function escapeHtml(str: string) {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[c],
  );
}

/** One visible character of highlighted html: a highlight span, an html entity or a plain character. */
const HIGHLIGHTED_CHAR_PATTERN = /<span class="highlight">(?:&[^;]+;|[^<])<\/span>|&[^;]+;|[^]/g;

/**
 * Splits the escaped html produced by the option highlighter after `charIndex` visible characters,
 * so the parts can be wrapped separately without breaking entities or highlight spans.
 */
export function splitHighlightedHtml(html: string, charIndex: number): [string, string] {
  if (charIndex <= 0) return ["", html];

  let visibleChars = 0;
  for (const match of html.matchAll(HIGHLIGHTED_CHAR_PATTERN)) {
    if (visibleChars === charIndex) {
      return [html.slice(0, match.index), html.slice(match.index)];
    }
    visibleChars++;
  }
  return [html, ""];
}

/** Wraps the directory part of a highlighted path in a muted span, keeping the file name prominent. */
export function muteDirectoryHtml(path: string, highlightedPath: string): string {
  const fileNameStart = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
  if (fileNameStart === 0) return highlightedPath;

  const [directory, fileName] = splitHighlightedHtml(highlightedPath, fileNameStart);
  return `<span class="sk-muted">${directory}</span>${fileName}`;
}

export function toInnerHTML(text: string): string {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function formatFileOptionHtml(svgIconUrl: string, text: string): string {
  return `
    <i class="file-icon">
      <img 
        src="${svgIconUrl}" 
        alt="" 
        loading="eager" 
        decoding="async"
        width="16"
        height="16"
      />
    </i>
    <span class="file-path">${text}</span>
`;
}
