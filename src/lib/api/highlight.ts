// Syntax highlighting for the content-negotiated HTML pages, powered by Shiki.
// A single highlighter instance is created lazily and reused across requests;
// we only load the languages and theme we actually render.

import { createHighlighter, type Highlighter } from "shiki";

export const HIGHLIGHT_THEME = "github-dark-default";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [HIGHLIGHT_THEME],
      langs: ["json"],
    });
  }
  return highlighterPromise;
}

/**
 * Render a string of code to a Shiki `<pre class="shiki">…</pre>` block with
 * inline token colors from the github-dark-default theme. Shiki escapes the
 * input, so pass the raw (un-escaped) source.
 */
export async function highlightCode(
  code: string,
  lang = "json"
): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, { lang, theme: HIGHLIGHT_THEME });
}
