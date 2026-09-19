// Shared values and behavior; keep the three repository-local copies aligned.
export const suiteTopbarStyles = `
.ezy-suite-host > .ezy-suite-topbar {
  --suite-bg:#fff; --suite-text:#1e2130; --suite-border:#e4e4ea; --suite-hover:#f0f0f3;
  --suite-focus:var(--ez-accent-2,var(--ez-accent,var(--ezygrid-selection,#00c47a)));
  display:flex; flex-wrap:nowrap; align-items:center; gap:12px; box-sizing:border-box;
  height:56px; min-height:56px; flex:0 0 56px; padding:0 12px;
  background:var(--suite-bg); color:var(--suite-text); border-bottom:1px solid var(--suite-border);
  font-family:Outfit,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  font-size:14px; line-height:1.4; position:relative; z-index:30;
}
.ezy-suite-host:is([data-theme=dark],[data-ez-resolved-theme=dark],.ez-dark) > .ezy-suite-topbar {
  --suite-bg:#191d27; --suite-text:#e5e7eb; --suite-border:#343b49; --suite-hover:#292f3c; color-scheme:dark;
}
.ezy-suite-host .ezy-suite-topbar .ezy-suite-brand { display:flex; align-items:center; gap:8px; flex:0 0 auto; margin:0; font-size:15px; font-weight:700; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-brand > :first-child { display:flex; width:28px; height:28px; border-radius:6px; overflow:hidden; flex:none; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-brand svg { display:block; width:28px; height:28px; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-brand > :last-child { display:block; font-size:15px; font-weight:700; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-title {
  flex:0 1 190px; width:190px; min-width:40px; height:36px; min-height:36px; padding:6px 10px;
  border:1px solid transparent; border-radius:6px; background:transparent; color:inherit; font:600 14px/1.4 Outfit,system-ui,sans-serif;
}
.ezy-suite-host .ezy-suite-topbar .ezy-suite-title:hover { border-color:var(--suite-border); }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-title:focus { border-color:var(--suite-focus); outline:2px solid var(--suite-focus); outline-offset:1px; background:var(--suite-bg); }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-actions { display:flex; align-items:center; gap:8px; flex:0 0 auto; margin-inline-start:auto; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-group { display:flex; align-items:center; gap:2px; flex:none; padding:0; margin:0; border:0; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-actions > .ezy-suite-group:not(:first-child) { padding-inline-start:8px; border-inline-start:1px solid var(--suite-border); }
.ezy-suite-host .ezy-suite-topbar :is(button,summary) {
  box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:36px; min-height:36px; min-width:36px; width:auto; padding:0 9px; margin:0;
  border:1px solid transparent; border-radius:6px; background:transparent; color:var(--suite-text);
  font:500 14px/1.4 Outfit,system-ui,sans-serif; cursor:pointer; white-space:nowrap; list-style:none;
}
.ezy-suite-host .ezy-suite-topbar summary::-webkit-details-marker { display:none; }
.ezy-suite-host .ezy-suite-topbar :is(button,summary):hover { background:var(--suite-hover); border-color:transparent; }
.ezy-suite-host .ezy-suite-topbar :is(button,summary):focus-visible { outline:2px solid var(--suite-focus); outline-offset:1px; }
.ezy-suite-host .ezy-suite-topbar button:disabled { opacity:.4; cursor:default; background:transparent; }
.ezy-suite-host .ezy-suite-topbar :is(button,summary) svg { display:block; width:18px; height:18px; flex:none; stroke-width:1.8; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-export:is(button),
.ezy-suite-host .ezy-suite-topbar .ezy-suite-export > summary { padding:0 12px; font-weight:600; background:var(--suite-export-bg); color:var(--suite-export-text); }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-export:is(button):hover,
.ezy-suite-host .ezy-suite-topbar .ezy-suite-export > summary:hover { filter:brightness(.95); }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-export :is(.ezg-chevron svg,svg:last-child:not(:first-child)),
.ezy-suite-host .ezy-suite-topbar .ezy-suite-export > summary > :last-child svg { width:14px; height:14px; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-popup {
  position:fixed; inset:auto; margin:0; padding:6px; min-width:210px; width:max-content; height:auto;
  max-width:calc(100vw - 16px); max-height:calc(100dvh - 16px); overflow:auto;
  border:1px solid var(--suite-border); border-radius:8px; background:var(--suite-bg); color:var(--suite-text);
  box-shadow:0 8px 28px #0002; font:14px/1.4 Outfit,system-ui,sans-serif; z-index:1200;
}
.ezy-suite-host .ezy-suite-topbar .ezy-suite-popup:popover-open { display:flex; flex-direction:column; gap:2px; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-popup :is(button,summary) { width:100%; justify-content:flex-start; text-align:start; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-popup button[aria-pressed=true] { background:var(--suite-hover); color:var(--suite-focus); font-weight:600; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-overflow .ezy-suite-group,
.ezy-suite-host .ezy-suite-topbar .ezy-suite-extras { display:flex; flex-direction:column; align-items:stretch; gap:2px; width:100%; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-overflow .ezy-suite-group + :is(.ezy-suite-group,.ezy-suite-extras:not(:empty)) { margin-top:4px; padding-top:4px; border-top:1px solid var(--suite-border); }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-extras:empty { display:none; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-overflow .ezy-suite-icon::after { content:attr(aria-label); }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-overflow details { width:100%; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-overflow .ez-theme-panel { position:static; box-shadow:none; width:100%; min-width:0; }
.ezy-suite-host .ezy-suite-topbar .ezy-suite-overflow .ez-theme-menu { display:flex; flex-direction:column; }
.ezy-suite-host .ezy-suite-topbar [hidden] { display:none!important; }
.ezy-suite-host .ezy-suite-topbar:is([data-density=compact],[data-density=small]) { gap:8px; }
.ezy-suite-host .ezy-suite-topbar:is([data-density=compact],[data-density=small]) .ezy-suite-brand > :last-child { display:none; }
.ezy-suite-host .ezy-suite-topbar:is([data-density=compact],[data-density=small]) .ezy-suite-title { width:110px; flex-basis:110px; }
.ezy-suite-host .ezy-suite-topbar[data-density=small] .ezy-suite-title { flex-grow:1; }
.ezy-suite-host .ezy-suite-topbar[data-density=small] .ezy-suite-export:is(button) > span,
.ezy-suite-host .ezy-suite-topbar[data-density=small] .ezy-suite-export > summary > span:not(.ez-menu-icon) { display:none; }
.ezy-suite-host .ezy-suite-topbar[data-density=small] .ezy-suite-export:is(button) > svg:last-child:not(:first-child),
.ezy-suite-host .ezy-suite-topbar[data-density=small] .ezy-suite-export > summary > .ez-menu-icon:last-child { display:none; }
`;
