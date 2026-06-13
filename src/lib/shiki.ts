import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Server-side shiki highlighter, kept deliberately small for the Workers
 * bundle: JSON grammar only, the JS regex engine (no oniguruma WASM), and the
 * css-variables theme so token colors come from the `--shiki-*` design tokens
 * in globals.css rather than a hardcoded palette.
 */
const cssVariablesTheme = createCssVariablesTheme();

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [cssVariablesTheme],
    langs: [import("@shikijs/langs/json")],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

/** Render a JSON string to highlighted `<pre><code>…` HTML. */
export async function highlightJson(code: string): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, { lang: "json", theme: "css-variables" });
}
