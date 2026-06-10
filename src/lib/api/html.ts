// HTML renderer for content-negotiated API routes.
// Returns a beautiful dark-themed page for browser requests.

import { highlightCode } from "./highlight";

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

export interface PageUser {
  name: string;
  email: string;
}

export interface PageNotice {
  title: string;
  message: string;
  actions?: { label: string; href: string; primary?: boolean }[];
}

export interface CreateFormField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number";
  placeholder?: string;
  required?: boolean;
}

export interface CreateForm {
  /** Card heading, e.g. "New task". */
  title: string;
  /** Endpoint to POST to. On success we redirect to `${endpoint}/${id}`. */
  endpoint: string;
  fields: CreateFormField[];
  submitLabel?: string;
}

export interface ListActions {
  /** "Edit" link target; defaults to the row's itemHref. */
  editHref?: (item: Record<string, unknown>) => string;
  /** DELETE endpoint; defaults to the row's itemHref. */
  deleteEndpoint?: (item: Record<string, unknown>) => string;
  /** Confirmation message shown before deleting. */
  deleteConfirm: (item: Record<string, unknown>) => string;
}

export interface ChildList {
  /** Card heading, e.g. "Subtasks". */
  title: string;
  items: Record<string, unknown>[];
  columns: ListColumn[];
  idKey?: string;
  itemHref?: (item: Record<string, unknown>) => string;
  /** Link to the full child collection page, e.g. /api/tasks/{id}/subtasks. */
  viewAllHref?: string;
  emptyMessage?: string;
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
    /** Per-row Edit/Delete actions (only pass for signed-in viewers). */
    actions?: ListActions;
  };
  /** Table of child resources rendered below the resource card. */
  childList?: ChildList;
  apiRef?: ApiRefItem[];
  /** Inline "create resource" form rendered above the list. */
  createForm?: CreateForm;
  description?: string;
  /** Logged-in human for the header account menu; null/undefined = signed out. */
  user?: PageUser | null;
  /** Callout card rendered in place of / above the main content (e.g. a sign-in prompt). */
  notice?: PageNotice;
}

function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline copy of the site logo (`src/components/logo.tsx`) for these static pages. */
function logoSvg(height: number): string {
  const width = (height / 48) * 240;
  return `<svg width="${width}" height="${height}" viewBox="0 0 240 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agent Tools">
    <g style="transform-origin:24px 24px">
      <path d="M 13 36 L 24 12 L 35 36" stroke="#5fd089" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter" />
      <path d="M 18 24 L 30 24" stroke="#fff" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter" />
      <path d="M 24 24 L 24 36" stroke="#fff" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter" />
    </g>
    <text x="58" y="30" font-family="'Spline Sans Mono','Fira Code',monospace" font-size="20" font-weight="700" letter-spacing="-0.8" fill="#f4f6f5">agent<tspan fill="#5fd089">tools</tspan></text>
  </svg>`;
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

async function resourceHtml(data: unknown): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const highlighted = await highlightCode(json, "json");
  return `
    <section class="card">
      <div class="card-header">
        <span class="card-label">Resource</span>
        <button class="copy-btn" onclick="copyJson()">Copy JSON</button>
      </div>
      <div class="json-block" id="json-data">${highlighted}</div>
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

function tableRowsHtml(opts: {
  items: Record<string, unknown>[];
  columns: ListColumn[];
  idKey: string;
  itemHref?: (item: Record<string, unknown>) => string;
  currentPath: string;
  actions?: ListActions;
}): string {
  const { items, columns, idKey, itemHref, currentPath, actions } = opts;
  return items
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

      const actionCells = actions
        ? `<td class="cell-actions">
            <a class="row-action" href="${escHtml(actions.editHref ? actions.editHref(item) : href)}" onclick="event.stopPropagation()">Edit</a>
            <button class="row-action row-action-danger"
                    data-endpoint="${escHtml(actions.deleteEndpoint ? actions.deleteEndpoint(item) : href)}"
                    data-confirm="${escHtml(actions.deleteConfirm(item))}"
                    onclick="agtlsRowDelete(event)">Delete</button>
          </td>`
        : "";

      return `<tr class="table-row" onclick="location.href='${escHtml(href)}'">${cells}${actionCells}</tr>`;
    })
    .join("");
}

function listHtml(
  list: NonNullable<PageOptions["list"]>,
  currentPath: string
): string {
  const { items, columns, idKey = "id", itemHref, hasMore, nextCursor, actions } = list;

  if (items.length === 0) {
    return `<section class="card"><p class="empty-state">No items yet.</p></section>`;
  }

  const headerCells =
    columns.map((c) => `<th>${escHtml(c.label)}</th>`).join("") +
    (actions ? `<th class="th-actions">Actions</th>` : "");

  const rows = tableRowsHtml({ items, columns, idKey, itemHref, currentPath, actions });

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

function childListHtml(child: ChildList, currentPath: string): string {
  const { items, columns, idKey = "id", itemHref, viewAllHref } = child;

  const header = `
    <div class="card-header">
      <span class="card-label">${escHtml(child.title)}</span>
      ${viewAllHref ? `<a class="view-all" href="${escHtml(viewAllHref)}">View all →</a>` : ""}
    </div>`;

  if (items.length === 0) {
    return `
      <section class="card">
        ${header}
        <p class="empty-state">${escHtml(child.emptyMessage ?? "No items yet.")}</p>
      </section>`;
  }

  const headerCells = columns
    .map((c) => `<th>${escHtml(c.label)}</th>`)
    .join("");
  const rows = tableRowsHtml({ items, columns, idKey, itemHref, currentPath });

  return `
    <section class="card table-card">
      ${header}
      <table class="resource-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

const rowDeleteScript = `
    <script>
      async function agtlsRowDelete(e) {
        e.stopPropagation();
        e.preventDefault();
        const btn = e.currentTarget || e.target;
        if (!confirm(btn.dataset.confirm)) return;
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        try {
          const res = await fetch(btn.dataset.endpoint, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
          });
          if (!res.ok && res.status !== 404) {
            let msg = 'Delete failed.';
            try {
              const data = await res.json();
              if (data && data.error && data.error.message) msg = data.error.message;
            } catch {}
            alert(msg);
            btn.disabled = false;
            btn.textContent = prev;
            return;
          }
          location.reload();
        } catch {
          alert('Network error. Please try again.');
          btn.disabled = false;
          btn.textContent = prev;
        }
      }
    </script>`;

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

  return `
    <details class="card api-ref">
      <summary class="section-title api-ref-summary">
        API Reference
        <svg class="caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      ${rows}
    </details>`;
}

function noticeHtml(notice: PageNotice): string {
  const actions = (notice.actions ?? [])
    .map(
      (a) =>
        `<a class="notice-btn${a.primary ? " notice-btn-primary" : ""}" href="${escHtml(a.href)}">${escHtml(a.label)}</a>`
    )
    .join("");
  return `
    <section class="card notice-card">
      <h2 class="notice-title">${escHtml(notice.title)}</h2>
      <p class="notice-message">${escHtml(notice.message)}</p>
      ${actions ? `<div class="notice-actions">${actions}</div>` : ""}
    </section>`;
}

function createFormHtml(form: CreateForm): string {
  const fields = form.fields
    .map((f) => {
      const id = `cf-${escHtml(f.name)}`;
      const optional = f.required
        ? ""
        : ` <span class="cf-optional">optional</span>`;
      const placeholder = escHtml(f.placeholder ?? "");
      const required = f.required ? " required" : "";
      const control =
        f.type === "textarea"
          ? `<textarea class="cf-input" id="${id}" name="${escHtml(f.name)}" rows="3" placeholder="${placeholder}"${required}></textarea>`
          : `<input class="cf-input" id="${id}" name="${escHtml(f.name)}" type="${f.type === "number" ? "number" : "text"}" placeholder="${placeholder}"${required}>`;
      return `<div class="cf-field"><label class="cf-label" for="${id}">${escHtml(f.label)}${optional}</label>${control}</div>`;
    })
    .join("");

  const numberFields = form.fields
    .filter((f) => f.type === "number")
    .map((f) => f.name);

  return `
    <div class="cf-toggle-row">
      <button type="button" class="cf-toggle" data-label="+ ${escHtml(form.title)}"
              aria-expanded="false" aria-controls="create-card"
              onclick="agtlsToggleCreate(this)">+ ${escHtml(form.title)}</button>
    </div>
    <section class="card create-card" id="create-card" hidden>
      <div class="card-header">
        <span class="card-label">${escHtml(form.title)}</span>
      </div>
      <form id="create-form" class="cf-body" onsubmit="return agtlsCreate(event)"
            data-endpoint="${escHtml(form.endpoint)}"
            data-numbers="${escHtml(numberFields.join(","))}">
        ${fields}
        <div class="cf-footer">
          <span class="cf-error" id="cf-error"></span>
          <button type="submit" class="cf-submit">${escHtml(form.submitLabel ?? "Create")}</button>
        </div>
      </form>
    </section>
    <script>
      function agtlsToggleCreate(btn) {
        const card = document.getElementById('create-card');
        const opening = card.hidden;
        card.hidden = !opening;
        btn.textContent = opening ? 'Cancel' : btn.dataset.label;
        btn.setAttribute('aria-expanded', String(opening));
        btn.classList.toggle('cf-toggle-open', opening);
        if (opening) {
          const first = card.querySelector('.cf-input');
          if (first) first.focus();
        }
      }
      async function agtlsCreate(e) {
        e.preventDefault();
        const form = e.target;
        const endpoint = form.dataset.endpoint;
        const numbers = (form.dataset.numbers || '').split(',').filter(Boolean);
        const btn = form.querySelector('.cf-submit');
        const errEl = form.querySelector('#cf-error');
        errEl.textContent = '';
        const payload = {};
        for (const el of form.querySelectorAll('[name]')) {
          const v = el.value.trim();
          if (v === '') continue;
          payload[el.name] = numbers.includes(el.name) ? Number(v) : v;
        }
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Creating…';
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) {
            errEl.textContent = (data && data.error && data.error.message) || 'Something went wrong.';
            btn.disabled = false;
            btn.textContent = prev;
            return false;
          }
          location.href = endpoint + '/' + data.id;
        } catch (err) {
          errEl.textContent = 'Network error. Please try again.';
          btn.disabled = false;
          btn.textContent = prev;
        }
        return false;
      }
    </script>`;
}

function navAccountHtml(user: PageUser | null | undefined): string {
  if (!user) {
    return `
      <a class="nav-link" href="/sign-in">Sign in</a>
      <a class="nav-cta" href="/sign-up">Sign up</a>`;
  }
  return `
    <details class="account-menu">
      <summary class="account-trigger">
        <span class="avatar">${escHtml((user.name || user.email).charAt(0).toUpperCase())}</span>
        <span class="account-name">${escHtml(user.name)}</span>
        <svg class="caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div class="menu">
        <div class="menu-head">
          <div class="menu-user">${escHtml(user.name)}</div>
          <div class="menu-email">${escHtml(user.email)}</div>
        </div>
        <a class="menu-item" href="/dashboard">Dashboard</a>
        <a class="menu-item" href="/keys">API keys</a>
        <a class="menu-item" href="/account">Account</a>
        <div class="menu-sep"></div>
        <button class="menu-item menu-signout" onclick="agtlsSignOut()">Sign out</button>
      </div>
    </details>
    <script>
      function agtlsSignOut() {
        fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).then(() => { location.href = '/'; });
      }
      document.addEventListener('click', (e) => {
        const open = document.querySelector('details.account-menu[open]');
        if (open && !open.contains(e.target)) open.removeAttribute('open');
      });
    </script>`;
}

export async function htmlResponse(
  opts: PageOptions,
  request: Request,
  status = 200
): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const currentPath = url.pathname;

  const body = `
    ${opts.description ? `<p class="page-desc">${escHtml(opts.description)}</p>` : ""}
    ${opts.notice ? noticeHtml(opts.notice) : ""}
    ${opts.resource !== undefined ? await resourceHtml(opts.resource) : ""}
    ${opts.childList ? childListHtml(opts.childList, currentPath) : ""}
    ${opts.createForm ? createFormHtml(opts.createForm) : ""}
    ${opts.list ? listHtml(opts.list, currentPath) : ""}
    ${opts.apiRef ? apiRefHtml(opts.apiRef, baseUrl) : ""}
    ${opts.list?.actions ? rowDeleteScript : ""}
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(opts.title)} — agtls</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #09090b; --bg-card: #18181b; --bg-hover: #1f1f23;
      --border: #27272a; --border-subtle: #1f1f23;
      --text: #fafafa; --muted: #71717a; --muted2: #52525b;
      --accent: #8b5cf6; --accent-fg: #c4b5fd;
      --font-mono: 'Spline Sans Mono',ui-monospace,'Cascadia Code','Source Code Pro',Menlo,monospace;
      --font-sans: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    body { background:var(--bg); color:var(--text); font-family:var(--font-sans);
           font-size:14px; line-height:1.6; min-height:100vh; }

    /* Nav */
    nav { border-bottom:1px solid var(--border); padding:0 24px;
          height:48px; display:flex; align-items:center; justify-content:space-between;
          position:sticky; top:0; background:var(--bg); z-index:10; }
    .nav-logo { display:inline-flex; align-items:center; text-decoration:none; }
    .nav-right { display:flex; align-items:center; gap:14px; }
    .nav-link { font-size:13px; color:var(--muted); text-decoration:none; }
    .nav-link:hover { color:var(--text); }
    .nav-cta { font-size:13px; font-weight:600; color:var(--accent-fg);
               text-decoration:none; padding:5px 12px; border-radius:6px;
               border:1px solid #312e81; background:#1e1b4b; }
    .nav-cta:hover { border-color:var(--accent); }

    /* Account dropdown */
    .account-menu { position:relative; }
    .account-menu summary { list-style:none; }
    .account-menu summary::-webkit-details-marker { display:none; }
    .account-trigger { display:flex; align-items:center; gap:8px; cursor:pointer;
                       padding:4px 10px 4px 4px; border-radius:99px;
                       border:1px solid var(--border); background:var(--bg-card);
                       transition:border-color .15s ease, background .15s ease; }
    .account-menu[open] .account-trigger, .account-trigger:hover {
      border-color:var(--accent); background:var(--bg-hover); }
    .avatar { width:24px; height:24px; border-radius:99px; background:#1e1b4b;
              border:1px solid #312e81; color:var(--accent-fg); font-size:12px;
              font-weight:700; display:inline-flex; align-items:center;
              justify-content:center; }
    .account-name { font-size:13px; color:var(--text); max-width:140px;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .caret { color:var(--muted); transition:transform .15s ease; }
    .account-trigger:hover .caret { color:var(--text); }
    .account-menu[open] .caret { transform:rotate(180deg); }
    .menu { position:absolute; right:0; top:calc(100% + 8px); min-width:220px;
            background:var(--bg-card); border:1px solid var(--border);
            border-radius:10px; padding:6px; z-index:20;
            box-shadow:0 12px 32px rgba(0,0,0,.5); }
    .menu-head { padding:8px 10px 10px; border-bottom:1px solid var(--border);
                 margin-bottom:6px; }
    .menu-user { font-size:13px; font-weight:600; color:var(--text); }
    .menu-email { font-size:12px; color:var(--muted); overflow:hidden;
                  text-overflow:ellipsis; white-space:nowrap; }
    .menu-item { display:block; width:100%; text-align:left; padding:7px 10px;
                 border-radius:6px; font-size:13px; color:var(--text);
                 text-decoration:none; background:transparent; border:none;
                 cursor:pointer; font-family:var(--font-sans); }
    .menu-item:hover { background:var(--bg-hover); }
    .menu-sep { height:1px; background:var(--border); margin:6px 0; }
    .menu-signout { color:#f87171; }

    /* Notice card (sign-in prompts, 403/404 pages) */
    .notice-card { padding:28px 24px; text-align:center; }
    .notice-title { font-size:17px; font-weight:600; margin-bottom:6px; }
    .notice-message { color:var(--muted); font-size:13px; max-width:48ch;
                      margin:0 auto; }
    .notice-actions { display:flex; gap:10px; justify-content:center;
                      margin-top:18px; }
    .notice-btn { font-size:13px; padding:7px 16px; border-radius:6px;
                  text-decoration:none; color:var(--text);
                  border:1px solid var(--border); }
    .notice-btn:hover { border-color:var(--accent); }
    .notice-btn-primary { background:#1e1b4b; border-color:#312e81;
                          color:var(--accent-fg); font-weight:600; }

    /* Create form */
    .cf-toggle-row { margin-bottom:16px; }
    .cf-toggle { font-size:13px; font-weight:600; color:var(--accent-fg);
                 padding:7px 16px; border-radius:6px; border:1px solid #312e81;
                 background:#1e1b4b; cursor:pointer; font-family:var(--font-sans); }
    .cf-toggle:hover { border-color:var(--accent); }
    .cf-toggle-open { color:var(--muted); background:transparent;
                      border-color:var(--border); }
    .cf-toggle-open:hover { color:var(--text); border-color:var(--accent); }
    .cf-body { padding:16px; display:flex; flex-direction:column; gap:14px; }
    .cf-field { display:flex; flex-direction:column; gap:6px; }
    .cf-label { font-size:12px; font-weight:600; color:var(--muted);
                text-transform:uppercase; letter-spacing:.5px; }
    .cf-optional { font-weight:500; text-transform:none; letter-spacing:0;
                   color:var(--muted2); }
    .cf-input { width:100%; background:#0f0f11; border:1px solid var(--border);
                border-radius:6px; padding:8px 11px; color:var(--text);
                font-family:var(--font-sans); font-size:13px; resize:vertical; }
    .cf-input::placeholder { color:var(--muted2); }
    .cf-input:focus { outline:none; border-color:var(--accent); }
    .cf-footer { display:flex; align-items:center; justify-content:flex-end;
                 gap:14px; margin-top:2px; }
    .cf-error { font-size:12px; color:#f87171; margin-right:auto; }
    .cf-submit { font-size:13px; font-weight:600; color:var(--accent-fg);
                 padding:7px 16px; border-radius:6px; border:1px solid #312e81;
                 background:#1e1b4b; cursor:pointer; font-family:var(--font-sans); }
    .cf-submit:hover { border-color:var(--accent); }
    .cf-submit:disabled { opacity:.6; cursor:default; }

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

    /* JSON — highlighted by Shiki (github-dark-default) */
    .json-block { overflow-x:auto; }
    .json-block .shiki { margin:0; padding:16px; overflow-x:auto;
                         font-family:var(--font-mono); font-size:12.5px;
                         line-height:1.7; }
    .json-block .shiki code { font-family:inherit; }

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

    /* Row actions */
    .th-actions { text-align:right; }
    td.cell-actions { text-align:right; white-space:nowrap; width:1%; }
    .row-action { display:inline-block; font-size:12px; color:var(--muted);
                  background:transparent; border:1px solid var(--border);
                  border-radius:6px; padding:3px 10px; cursor:pointer;
                  text-decoration:none; font-family:var(--font-sans);
                  line-height:1.5; vertical-align:middle; }
    .row-action:hover { color:var(--text); border-color:var(--accent); }
    .row-action + .row-action { margin-left:6px; }
    .row-action-danger:hover { color:#f87171; border-color:#f87171; }
    .row-action:disabled { opacity:.6; cursor:default; }

    /* Child list */
    .view-all { font-size:12px; color:var(--accent-fg); text-decoration:none; }
    .view-all:hover { text-decoration:underline; }

    /* Pagination */
    .pagination { padding:12px 16px; border-top:1px solid var(--border); }
    .pg-link { color:var(--accent-fg); text-decoration:none; font-size:13px; }
    .pg-link:hover { text-decoration:underline; }

    /* API ref */
    .section-title { font-size:13px; font-weight:600; color:var(--muted); padding:14px 16px;
                     border-bottom:1px solid var(--border); text-transform:uppercase;
                     letter-spacing:.6px; }
    .api-ref-summary { display:flex; align-items:center; justify-content:space-between;
                       cursor:pointer; list-style:none; user-select:none; }
    .api-ref-summary::-webkit-details-marker { display:none; }
    .api-ref-summary:hover { color:var(--text); }
    .api-ref:not([open]) .api-ref-summary { border-bottom:none; }
    .api-ref[open] .api-ref-summary .caret { transform:rotate(180deg); }
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
    <a class="nav-logo" href="/" aria-label="Agent Tools home">${logoSvg(26)}</a>
    <div class="nav-right">
      ${navAccountHtml(opts.user)}
    </div>
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
      <p>Also available via MCP: <code>POST /api/mcp</code> with <code>Authorization: Bearer agt_...</code></p>
    </div>
  </main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Friendly full-page error for browser requests (403/404). Keeps the regular
 * chrome — including the account menu — so a signed-in user can navigate away.
 */
export function errorHtmlResponse(
  opts: {
    status: number;
    title: string;
    message: string;
    user?: PageUser | null;
  },
  request: Request
): Promise<Response> {
  const actions = opts.user
    ? [
        { label: "Go to dashboard", href: "/dashboard", primary: true },
        { label: "Home", href: "/" },
      ]
    : [
        { label: "Sign in", href: "/sign-in", primary: true },
        { label: "Home", href: "/" },
      ];

  return htmlResponse(
    {
      title: String(opts.status),
      breadcrumb: [{ label: "API", href: "/api" }],
      user: opts.user,
      notice: {
        title: opts.title,
        message: opts.message,
        actions,
      },
    },
    request,
    opts.status
  );
}
