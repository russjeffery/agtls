import { apiCatalog } from "./api-catalog";
import { mcpToolGroups } from "./mcp-catalog";
import type { NavSection } from "@/components/docs/docs-sidebar";

// Builds the docs sidebar model from the API and MCP catalogs. Shared by the
// docs layout so every page renders the same navigation.
export async function buildDocsNav(): Promise<NavSection[]> {
  const { groups } = apiCatalog();
  const toolGroups = await mcpToolGroups();

  const apiSection: NavSection = {
    title: "REST API",
    href: "/docs/api",
    subgroups: [
      { items: [{ label: "Overview", href: "/docs/api" }] },
      ...groups.map((g) => ({
        label: g.name,
        items: g.operations.map((op) => ({
          label: op.summary,
          href: `/docs/api/${op.slug}`,
          method: op.method.toUpperCase(),
        })),
      })),
    ],
  };

  const mcpSection: NavSection = {
    title: "MCP Server",
    href: "/docs/mcp",
    subgroups: [
      { items: [{ label: "Overview", href: "/docs/mcp" }] },
      ...toolGroups.map((g) => ({
        label: g.label,
        items: g.tools.map((t) => ({
          label: t.name,
          href: `/docs/mcp/${t.name}`,
        })),
      })),
    ],
  };

  return [
    {
      title: "Documentation",
      subgroups: [{ items: [{ label: "Introduction", href: "/docs" }] }],
    },
    apiSection,
    mcpSection,
  ];
}
