import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Server-side shiki highlighter, kept deliberately small for the Workers
 * bundle: JSON + shell grammars only, the JS regex engine (no oniguruma WASM),
 * and the css-variables theme so token colors come from the `--shiki-*` design
 * tokens in globals.css rather than a hardcoded palette.
 */
const cssVariablesTheme = createCssVariablesTheme();

export type HighlightLang = "json" | "bash";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [cssVariablesTheme],
    langs: [import("@shikijs/langs/json"), import("@shikijs/langs/bash")],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

/** Render a snippet to highlighted `<pre><code>…` HTML for the given grammar. */
export async function highlight(
  code: string,
  lang: HighlightLang,
): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, { lang, theme: "css-variables" });
}

/** Render a JSON string to highlighted `<pre><code>…` HTML. */
export async function highlightJson(code: string): Promise<string> {
  return highlight(code, "json");
}
