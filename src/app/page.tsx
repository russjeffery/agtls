export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-32">
      <div className="max-w-2xl w-full space-y-8">
        {/* Wordmark */}
        <div>
          <span className="font-mono text-2xl font-bold tracking-tight text-white">
            ag<span className="text-violet-400">tools</span>
          </span>
          <p className="mt-2 text-sm text-zinc-400 font-mono">
            Open-source infrastructure for AI agents
          </p>
        </div>

        {/* Tools */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: "Tasks", path: "/api/tasks", desc: "Create tasks (containers), add subtasks, track status and priority.", badge: "live" },
            { name: "Webhook Catcher", path: "/api/webhooks", desc: "Receive, store, and inspect inbound webhooks.", badge: "live" },
            { name: "Pub/Sub", path: "/api/channels", desc: "Publish messages and subscribe via webhook or poll.", badge: "soon" },
            { name: "Gist", path: "/api/gists", desc: "Store and retrieve text blobs with a key.", badge: "soon" },
          ].map((tool) => (
            <div
              key={tool.name}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-100">{tool.name}</span>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                    tool.badge === "live"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {tool.badge}
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
              {tool.badge === "live" && (
                <code className="text-xs text-zinc-600 font-mono">{tool.path}</code>
              )}
            </div>
          ))}
        </div>

        {/* MCP endpoint */}
        <div className="rounded-lg border border-violet-900/50 bg-violet-950/20 p-4 space-y-1">
          <p className="text-xs font-semibold text-violet-400 font-mono">MCP endpoint</p>
          <code className="text-xs text-zinc-400 font-mono">POST /api/mcp</code>
          <p className="text-xs text-zinc-500">
            All tools are available via the Model Context Protocol. Pass your API key as{" "}
            <code className="text-zinc-400">Authorization: Bearer agt_live_...</code>
          </p>
        </div>

        {/* Auth note */}
        <p className="text-xs text-zinc-600">
          No API key? Resources are public by default — anyone with the ID can read and write.
          Create a project to own your resources.
        </p>
      </div>
    </main>
  );
}
