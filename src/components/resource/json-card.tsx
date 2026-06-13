import { highlightJson } from "@/lib/shiki";
import { JsonCardView } from "./json-card-view";

/**
 * Collapsible "raw JSON" card with a copy button — the API representation of a
 * resource, for users who want to see exactly what an agent receives.
 * Highlighting runs server-side via shiki (src/lib/shiki.ts); the interactive
 * shell lives in JsonCardView.
 */
export async function JsonCard({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  return <JsonCardView json={json} html={await highlightJson(json)} />;
}
