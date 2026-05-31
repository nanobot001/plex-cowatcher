import type { Router } from "express";

export function registerWebRoutes(router: Router): void {
  router.get("/", (_req, res) => {
    res.type("html").send(renderPage("Dashboard", `
      <section class="band">
        <h2>Service Health</h2>
        <div id="readiness" class="readiness-grid" aria-live="polite"></div>
        <pre id="health">Loading...</pre>
      </section>
      <section class="band">
        <h2>Recent Activity</h2>
        <p>Use the API, CLI, or Discord prompt flow while the richer history copy UI fills in.</p>
      </section>
      <script>
        fetch('/api/health').then(r => r.json()).then(data => {
          const readiness = data.readiness || {};
          const labels = {
            database: 'Database',
            plex: 'Plex',
            tautulli: 'Tautulli',
            discord: 'Discord',
            watcher: 'Watcher',
            plexMutation: 'Plex mutation'
          };
          const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          })[character]);
          document.getElementById('readiness').innerHTML = Object.entries(labels).map(([key, label]) => {
            const item = readiness[key] || { status: 'unconfigured', message: 'No status reported.' };
            return '<article class="readiness-item status-' + escapeHtml(item.status) + '">' +
              '<div class="readiness-label">' + escapeHtml(label) + '</div>' +
              '<div class="readiness-status">' + escapeHtml(item.status) + '</div>' +
              '<p>' + escapeHtml(item.message) + '</p>' +
            '</article>';
          }).join('');
          document.getElementById('health').textContent = JSON.stringify(data, null, 2);
        });
      </script>
    `));
  });

  router.get("/copy", (_req, res) => {
    res.type("html").send(renderPage("Copy History", `
      <form method="post" action="/api/history-copy/preview">
        <label>Source user <input name="sourceUser" value="Tony"></label>
        <label>Target user <input name="targetUsers" value="Ian"></label>
        <label>Show <input name="showTitle"></label>
        <button type="submit">Preview</button>
      </form>
    `));
  });

  router.get("/audit", (_req, res) => {
    res.type("html").send(renderPage("Audit Log", `
      <pre id="audit">Loading...</pre>
      <script>
        fetch('/api/audit?days=7').then(r => r.json()).then(data => {
          document.getElementById('audit').textContent = JSON.stringify(data, null, 2);
        });
      </script>
    `));
  });
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} - Plex Co-Watch Sync</title>
      <link rel="stylesheet" href="/static/styles.css">
    </head>
    <body>
      <nav><strong>Plex Co-Watch Sync</strong><a href="/">Dashboard</a><a href="/copy">Copy History</a><a href="/audit">Audit</a></nav>
      <main><h1>${title}</h1>${body}</main>
    </body>
  </html>`;
}
