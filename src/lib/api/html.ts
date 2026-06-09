// HTML renderer for content-negotiated API routes.
// Returns a beautiful dark-themed page for browser requests.

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface ApiRefItem {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  description: string;
}

export interface ListColumn {
  key: string;
  label: string;
  mono?: boolean;
  badge?: Record<string, string>; // value → CSS color class
}

export interface PageOptions {
  title: string;
  objectType?: string;
  breadcrumb: BreadcrumbItem[];
  resource?: unknown;
  list?: {
    items: Record<string, unknown>[];
    columns: ListColumn[];
    idKey?: string;
    itemHref?: (item: Record<string, unknown>) => string;
    hasMore: boolean;
    nextCursor?: string | null;
  };
  apiRef?: ApiRefItem[];
  description?: string;
}

function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightJson(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="jk">${match}</span>`; // key
        return `<span class="js">${match}</span>`; // string
      }
      if (/true|false/.test(match)) return `<span class="jb">${match}</span>`; // boolean
      if (/null/.test(match)) return `<span class="jn">${match}</span>`; // null
      return `<span class="jnum">${match}</span>`; // number
    }
  );
}

const methodColors: Record<string, string> = {
  GET: "#34d399",
  POST: "#60a5fa",
  PATCH: "#fbbf24",
  DELETE: "#f87171",
  PUT: "#a78bfa",
};

function methodBadge(method: string): string {
  const color = methodColors[method] ?? "#a1a1aa";
  return `<span class="method-badge" style="color:${color}">${method}</span>`;
}

function breadcrumbHtml(items: BreadcrumbItem[]): string {
  return items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      const label = escHtml(item.label);
      if (isLast || !item.href)
        return `<span class="${isLast ? "bc-current" : "bc-item"}">${label}</span>`;
      return `<a class="bc-item bc-link" href="${escHtml(item.href)}">${label}</a>`;
    })
    .join('<span class="bc-sep">/</span>');
}

function resourceHtml(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  const highlighted = highlightJson(escHtml(json));
  return `
    <section class="card">
      <div class="card-header">
        <span class="card-label">Resource</span>
        <button class="copy-btn" onclick="copyJson()">Copy JSON</button>
      </div>
      <pre class="json-block" id="json-data">${highlighted}</pre>
    </section>
    <script>
      const _raw = ${JSON.stringify(json)};
      function copyJson() {
        navigator.clipboard.writeText(_raw).then(() => {
          const btn = document.querySelector('.copy-btn');
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = prev, 1500);
        });
      }
    </script>`;
}

function listHtml(
  list: NonNullable<PageOptions["list"]>,
  currentPath: string
): string {
  const { items, columns, idKey = "id", itemHref, hasMore, nextCursor } = list;

  if (items.length === 0) {
    return `<section class="card"><p class="empty-state">No items yet.</p></section>`;
  }

  const headerCells = columns
    .map((c) => `<th>${escHtml(c.label)}</th>`)
    .join("");

  const rows = items
    .map((item) => {
      const id = item[idKey];
      const href = itemHref ? itemHref(item) : `${currentPath}/${escHtml(String(id))}`;
      const cells = columns
        .map((col) => {
          const val = item[col.key];
          if (val === null || val === undefined) {
            return `<td class="cell-null">—</td>`;
          }
          if (col.badge && typeof val === "string" && col.badge[val]) {
            return `<td><span class="badge" style="color:${col.badge[val]}">${escHtml(val)}</span></td>`;
          }
          const cls = col.mono ? ' class="mono"' : "";
          return `<td${cls}>${escHtml(String(val))}</td>`;
        })
        .join("");

      return `<tr class="table-row" onclick="location.href='${escHtml(href)}'">${cells}</tr>`;
    })
    .join("");

  const pagination = hasMore && nextCursor
    ? `<div class="pagination"><a class="pg-link" href="?after=${escHtml(nextCursor)}">Next page →</a></div>`
    : "";

  return `
    <section class="card table-card">
      <table class="resource-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${pagination}
    </section>`;
}

function apiRefHtml(items: ApiRefItem[], baseUrl: string): string {
  const rows = items
    .map(
      (item) => `
      <div class="api-row">
        <div class="api-method-path">
          ${methodBadge(item.method)}
          <code class="api-path">${escHtml(item.path)}</code>
        </div>
        <p class="api-desc">${escHtml(item.description)}</p>
        <div class="curl-example">
          <code class="curl-line">curl -X ${item.method} ${escHtml(baseUrl + item.path)}</code>
        </div>
      </div>`
    )
    .join("");

  return `<section class="card"><h2 class="section-title">API Reference</h2>${rows}</section>`;
}

export function htmlResponse(opts: PageOptions, request: Request): Response {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const currentPath = url.pathname;

  const body = `
    ${opts.description ? `<p class="page-desc">${escHtml(opts.description)}</p>` : ""}
    ${opts.resource !== undefined ? resourceHtml(opts.resource) : ""}
    ${opts.list ? listHtml(opts.list, currentPath) : ""}
    ${opts.apiRef ? apiRefHtml(opts.apiRef, baseUrl) : ""}
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(opts.title)} — agtls</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #09090b; --bg-card: #18181b; --bg-hover: #1f1f23;
      --border: #27272a; --border-subtle: #1f1f23;
      --text: #fafafa; --muted: #71717a; --muted2: #52525b;
      --accent: #8b5cf6; --accent-fg: #c4b5fd;
      --font-mono: ui-monospace,'Cascadia Code','Source Code Pro',Menlo,monospace;
      --font-sans: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    body { background:var(--bg); color:var(--text); font-family:var(--font-sans);
           font-size:14px; line-height:1.6; min-height:100vh; }

    /* Nav */
    nav { border-bottom:1px solid var(--border); padding:0 24px;
          height:48px; display:flex; align-items:center; justify-content:space-between;
          position:sticky; top:0; background:var(--bg); z-index:10; }
    .nav-logo { font-family:var(--font-mono); font-size:15px; font-weight:700;
                color:var(--text); text-decoration:none; }
    .nav-logo span { color:var(--accent-fg); }
    .nav-badge { font-family:var(--font-mono); font-size:11px; padding:2px 8px;
                 border-radius:99px; border:1px solid var(--border);
                 color:var(--muted); letter-spacing:.5px; }

    /* Breadcrumb */
    .breadcrumb { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
    .bc-item { color:var(--muted); font-family:var(--font-mono); font-size:12px; }
    .bc-link { text-decoration:none; }
    .bc-link:hover { color:var(--text); }
    .bc-sep { color:var(--muted2); font-size:12px; padding:0 2px; }
    .bc-current { color:var(--text); font-family:var(--font-mono); font-size:12px; }

    /* Main layout */
    main { max-width:860px; margin:0 auto; padding:32px 24px 80px; }
    .page-header { margin-bottom:28px; }
    .page-title { font-size:22px; font-weight:600; font-family:var(--font-mono);
                  letter-spacing:-.3px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .object-badge { font-size:11px; font-weight:500; padding:3px 10px; border-radius:99px;
                    background:#1e1b4b; border:1px solid #312e81; color:var(--accent-fg);
                    letter-spacing:.3px; font-family:var(--font-sans); }
    .page-desc { color:var(--muted); margin-bottom:24px; font-size:13px; }
    .breadcrumb-wrap { margin-bottom:16px; }

    /* Cards */
    .card { background:var(--bg-card); border:1px solid var(--border);
            border-radius:10px; margin-bottom:16px; overflow:hidden; }
    .card-header { display:flex; align-items:center; justify-content:space-between;
                   padding:12px 16px; border-bottom:1px solid var(--border); }
    .card-label { font-size:11px; font-weight:600; text-transform:uppercase;
                  letter-spacing:.8px; color:var(--muted); }
    .copy-btn { font-size:11px; padding:4px 10px; border-radius:6px; cursor:pointer;
                background:transparent; border:1px solid var(--border);
                color:var(--muted); font-family:var(--font-sans); }
    .copy-btn:hover { border-color:var(--accent); color:var(--accent-fg); }

    /* JSON */
    .json-block { padding:16px; font-family:var(--font-mono); font-size:12.5px;
                  line-height:1.7; overflow-x:auto; white-space:pre; color:#e4e4e7; }
    .jk { color:var(--accent-fg); }
    .js { color:#86efac; }
    .jnum { color:#fcd34d; }
    .jb { color:#fb923c; }
    .jn { color:var(--muted); }

    /* Table */
    .table-card { overflow:hidden; }
    .resource-table { width:100%; border-collapse:collapse; }
    .resource-table th { padding:10px 16px; text-align:left; font-size:11px;
                         font-weight:600; text-transform:uppercase; letter-spacing:.6px;
                         color:var(--muted); border-bottom:1px solid var(--border);
                         background:var(--bg-card); }
    .resource-table td { padding:11px 16px; border-bottom:1px solid var(--border-subtle);
                         font-size:13px; color:var(--text); }
    .table-row { cursor:pointer; }
    .table-row:last-child td { border-bottom:none; }
    .table-row:hover td { background:var(--bg-hover); }
    td.mono { font-family:var(--font-mono); font-size:12px; }
    td.cell-null { color:var(--muted2); }
    .badge { font-size:11px; font-weight:600; font-family:var(--font-mono); }

    /* Pagination */
    .pagination { padding:12px 16px; border-top:1px solid var(--border); }
    .pg-link { color:var(--accent-fg); text-decoration:none; font-size:13px; }
    .pg-link:hover { text-decoration:underline; }

    /* API ref */
    .section-title { font-size:13px; font-weight:600; color:var(--muted); padding:14px 16px;
                     border-bottom:1px solid var(--border); text-transform:uppercase;
                     letter-spacing:.6px; }
    .api-row { padding:14px 16px; border-bottom:1px solid var(--border-subtle); }
    .api-row:last-child { border-bottom:none; }
    .api-method-path { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
    .method-badge { font-family:var(--font-mono); font-size:11px; font-weight:700;
                    letter-spacing:.5px; min-width:52px; }
    .api-path { font-family:var(--font-mono); font-size:13px; color:var(--text); }
    .api-desc { color:var(--muted); font-size:12px; margin-bottom:8px; }
    .curl-example { background:#0f0f11; border:1px solid var(--border-subtle);
                    border-radius:6px; padding:8px 12px; }
    .curl-line { font-family:var(--font-mono); font-size:11.5px; color:#a1a1aa;
                 white-space:pre-wrap; word-break:break-all; }

    /* Empty */
    .empty-state { padding:32px 16px; text-align:center; color:var(--muted); font-size:13px; }

    /* MCP hint */
    .mcp-hint { margin-top:24px; padding:12px 16px; border:1px solid #1e1b4b;
                border-radius:10px; background:#0d0b1a; }
    .mcp-hint p { font-size:12px; color:var(--muted); }
    .mcp-hint code { font-family:var(--font-mono); color:var(--accent-fg); }
  </style>
</head>
<body>
  <nav>
    <a class="nav-logo" href="/">ag<span>tools</span></a>
    <span class="nav-badge">REST + MCP</span>
  </nav>
  <main>
    <div class="breadcrumb-wrap">
      <div class="breadcrumb">${breadcrumbHtml(opts.breadcrumb)}</div>
    </div>
    <div class="page-header">
      <h1 class="page-title">
        ${escHtml(opts.title)}
        ${opts.objectType ? `<span class="object-badge">${escHtml(opts.objectType)}</span>` : ""}
      </h1>
    </div>
    ${body}
    <div class="mcp-hint">
      <p>Also available via MCP: <code>POST /api/mcp</code> with <code>Authorization: Bearer agt_live_...</code></p>
    </div>
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
