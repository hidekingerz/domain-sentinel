export const APP_CSS = `:root { color-scheme: light dark; --fg:#1e293b; --bg:#f8fafc; --card:#fff; --line:#e2e8f0; --pass:#15803d; --warn:#b45309; --fail:#b91c1c; --error:#6b7280; }
@media (prefers-color-scheme: dark) { :root { --fg:#e2e8f0; --bg:#0f172a; --card:#1e293b; --line:#334155; } }
* { box-sizing: border-box; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
.topbar { display:flex; justify-content: space-between; align-items:center; padding: .75rem 1.5rem; border-bottom:1px solid var(--line); background: var(--card); }
.topbar .brand { font-weight: 700; text-decoration: none; color: var(--fg); }
.topbar nav a, .topbar nav button { margin-left: 1rem; color: var(--fg); text-decoration: none; }
.topbar form { display: inline; }
main { max-width: 1100px; margin: 2rem auto; padding: 0 1.5rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
.card-narrow { max-width: 480px; }
.card-login { max-width: 420px; margin: 4rem auto; }
.card-header { display:flex; justify-content:space-between; align-items:center; }
.card-header h1 { margin: 0; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
col.col-kind { width: 4.5rem; }
col.col-selector { width: 8rem; }
col.col-status { width: 5.5rem; }
col.col-checked { width: 11rem; }
col.col-action { width: 6rem; }
col.col-trigger { width: 6rem; }
col.col-num { width: 6rem; }
@media (max-width: 900px) {
  col.col-selector { width: 6rem; }
  col.col-checked { width: 8rem; }
}
th, td { padding: .5rem .75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
th { font-size: .85rem; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
.badge { display: inline-block; padding: .1rem .5rem; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
.badge.pass { background: #dcfce7; color: var(--pass); }
.badge.warn { background: #fef3c7; color: var(--warn); }
.badge.fail { background: #fee2e2; color: var(--fail); }
.badge.error { background: #e5e7eb; color: var(--error); }
.badge.unknown { background: #e5e7eb; color: var(--error); }
.pass { color: var(--pass); } .warn { color: var(--warn); } .fail { color: var(--fail); } .error { color: var(--error); }
form label { display:block; margin-bottom: 1rem; }
form input[type="text"], form input[type="password"] { width: 100%; padding: .5rem; border:1px solid var(--line); border-radius:6px; background: var(--bg); color: var(--fg); }
button { padding: .5rem 1rem; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); cursor: pointer; }
button.primary { background: #2563eb; color: white; border-color: #2563eb; }
button.linklike { background: none; border: none; color: var(--fg); padding: 0; cursor: pointer; text-decoration: underline; }
pre { padding: .75rem; background: var(--bg); border-radius: 6px; border: 1px solid var(--line); font-size: .85rem; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }
.row-actions { display:flex; gap: .5rem; }
.muted { color: #64748b; font-size: .85rem; }
.finding-list { margin: 0; padding-left: 1.2rem; }
.inline-form { display: inline; }
`;
