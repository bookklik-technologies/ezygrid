import { suiteTopbarStyles } from './suite-topbar-styles.js';

// The Outfit font is OPTIONAL (L3): the suite renders with the system
// fallback stack by default, so no third-party network request is made
// (CSP-safe, offline-safe). Hosts that want Outfit load it themselves, e.g.
// <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap">
export const editorStyles = `
.ezygrid-suite{--ezg-surface:#f7f9fb;--ezg-muted:#64748b;position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:220px;overflow:hidden;box-sizing:border-box;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:0px;background:var(--ezygrid-bg,#fff);color:var(--ezygrid-text,#0f172a);font:13px Outfit,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,Roboto,'Helvetica Neue',sans-serif;isolation:isolate}
.ezygrid-suite[data-theme=dark]{--ezg-surface:#23252b;--ezg-muted:#9a9da8;--ezygrid-bg:#17181d;--ezygrid-text:#e8e9ee;--ezygrid-gridline:#383a41;--ezygrid-header-bg:#23252b;--ezygrid-header-text:#9a9da8;--ezygrid-selection:#00ff99;--ezygrid-selection-soft:rgba(0,255,153,.16);color-scheme:dark}
.ezygrid-suite *{box-sizing:border-box}
.ezygrid-suite button,.ezygrid-suite input,.ezygrid-suite select,.ezygrid-suite textarea{font:inherit;color:inherit}
.ezygrid-suite button{cursor:pointer;border:1px solid transparent;border-radius:6px;background:transparent;min-height:32px;padding:5px 9px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.ezygrid-suite button:hover{background:var(--ezg-surface);border-color:var(--ezygrid-gridline,#e2e8f0)}
.ezygrid-suite button:disabled{opacity:.45;cursor:default}
.ezygrid-suite button[aria-pressed=true],.ezygrid-suite button[aria-selected=true]{background:var(--ezygrid-selection-soft,#e6fff4);color:var(--ezygrid-text,#00674a);border-color:var(--ezygrid-selection,#00c47a)}
.ezygrid-suite :focus-visible{outline:2px solid var(--ezygrid-selection,#00c47a);outline-offset:1px}
.ezygrid-suite input,.ezygrid-suite select,.ezygrid-suite textarea{min-width:0;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:6px;background:var(--ezygrid-bg,#fff);padding:5px 7px;min-height:29px}
.ezygrid-suite input[type=color]{width:36px;padding:3px}
.ezygrid-suite input[type=checkbox]{min-height:16px;accent-color:var(--ezygrid-selection,#00c47a)}
.ezygrid-suite svg{width:18px;height:18px;flex-shrink:0}
.ezygrid-suite .ezygrid-contextmenu-item svg{width:14px;height:14px}
.ezg-topbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0);flex-shrink:0;min-height:52px}
.ezg-brand{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600;margin-inline-end:8px}
.ezg-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:6px;overflow:hidden;flex-shrink:0}
.ezg-mark svg{width:28px;height:28px;display:block}
.ezg-title{width:180px;border-color:transparent;font-weight:500}
.ezg-spacer{flex:1}
.ezygrid-suite .ezg-primary{background:var(--ezygrid-selection,#00c47a);color:#052e24;font-weight:600}
.ezg-tabs{display:flex;align-items:center;gap:2px;padding:3px 10px 0;overflow-x:auto;scrollbar-width:none;flex-shrink:0;box-shadow:inset 0 -1px var(--ezygrid-gridline,#e2e8f0)}
.ezg-tabs::-webkit-scrollbar{display:none}
.ezg-tabs button{border-radius:6px 6px 0 0;padding:6px 13px}
.ezygrid-suite .ezg-tabs button[role=tab][aria-selected=true]{background:var(--ezg-surface);color:var(--ezygrid-text,#0f172a);border-color:var(--ezygrid-gridline,#e2e8f0)}
.ezygrid-suite .ezg-tabs[data-ribbon-expanded=true] button[role=tab][aria-selected=true]{border-bottom-color:var(--ezg-surface)}
.ezygrid-suite .ezg-tabs button[role=tab]:focus-visible{outline-offset:-3px}
.ezg-ribbon{display:flex;gap:0;padding:8px;min-height:82px;overflow-x:auto;flex-shrink:0;background:var(--ezg-surface);border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezg-group{display:flex;flex-direction:column;justify-content:space-between;gap:5px;padding:0 10px;border-inline-end:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezg-group:last-child{border:0}.ezg-group-label{font-size:10px;color:var(--ezg-muted);text-align:center;letter-spacing:.02em}
.ezg-controls{display:flex;align-items:center;gap:3px;min-height:36px}.ezg-controls .ezg-select{max-width:135px}.ezg-controls input[type=number]{width:57px}
.ezg-main{display:flex;flex:1;min-height:0;min-width:0;position:relative}.ezg-viewport{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden}
.ezg-bottom{display:flex;align-items:center;gap:8px;min-height:36px;flex-shrink:0;padding:2px 8px;border-top:1px solid var(--ezygrid-gridline,#e2e8f0);background:var(--ezg-surface)}
.ezg-sheets{display:flex;align-items:center;gap:3px;overflow-x:auto;min-width:0;flex:1}.ezg-sheets button{font-size:12px;min-height:28px}.ezg-stats{color:var(--ezg-muted);white-space:nowrap;font-size:11px}
.ezg-form{display:flex;flex-direction:column;gap:11px}.ezg-field{display:flex;flex-direction:column;gap:4px;font-size:12px}.ezg-field textarea{min-height:75px;resize:vertical}.ezg-field select,.ezg-field .ezg-select{width:100%}.ezg-field input[type=checkbox]{align-self:flex-start}
.ezg-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.ezg-hint{font-size:12px;line-height:1.5;color:var(--ezg-muted);margin:4px 0 10px}.ezg-list{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}.ezg-list button{justify-content:flex-start;white-space:normal;text-align:start}
.ezg-dialog{border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:14px;background:var(--ezygrid-bg,#fff);color:inherit;padding:22px;width:min(440px,90%);max-height:85%;overflow:auto;box-shadow:0 20px 70px rgba(0,0,0,.25);font:inherit}
.ezg-dialog::backdrop{background:#0f172a66}.ezg-dialog h2{font-size:18px;margin:0 0 16px}.ezg-dialog .ezg-actions{justify-content:flex-end}
.ezg-message{position:absolute;bottom:43px;inset-inline-start:12px;z-index:1100;max-width:calc(100% - 24px);padding:10px 14px;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:10px;background:var(--ezygrid-bg,#fff);box-shadow:0 8px 28px rgba(15,15,20,.13),0 2px 6px rgba(15,15,20,.05);font-size:12px;display:flex;gap:12px;align-items:center}
.ezygrid-suite .ezygrid-formulabar{border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezygrid-suite .ezygrid-formulabar input{min-height:0;padding:1px 8px;border-radius:0;border-top:0;border-bottom:0}
.ezygrid-suite .ezygrid-contextmenu{border-radius:10px;padding:4px;min-width:180px!important;font:inherit}.ezygrid-contextmenu-item:hover{background:var(--ezygrid-selection-soft,#e6fff4)}
.ezg-export-menu{position:absolute;z-index:900;display:flex;flex-direction:column;background:var(--ezygrid-bg,#fff);border:1px solid var(--ezygrid-gridline,#e2e8f0);box-shadow:0 8px 28px rgba(15,15,20,.13),0 2px 6px rgba(15,15,20,.05)}
.ezygrid-suite .ezg-export-menu .ezygrid-contextmenu-item{padding:7px 12px;border-radius:6px;font-weight:500;white-space:nowrap}
.ezg-export .ezg-chevron{display:flex}
.ezg-export .ezg-chevron svg{width:14px;height:14px;transition:transform .15s ease}
.ezg-export.ezg-menu-open .ezg-chevron svg{transform:rotate(180deg)}
.ezygrid-suite [hidden]{display:none!important}
@media(max-width:700px){.ezg-brand{font-size:0;margin:0}.ezg-title{width:110px}.ezg-topbar{gap:3px;padding:6px}.ezg-topbar .ezg-optional{display:none}.ezg-stats{display:none}.ezg-tabs button{padding:6px 9px}}
.ezygrid-suite{container-type:inline-size}
.ezygrid-suite .ezg-object-dialog{padding:0;width:min(560px,calc(100vw - 32px));min-width:0}
.ezygrid-suite .ezg-object-dialog>header{padding:12px 14px;margin:0;border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezg-object-body{flex:1;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;padding:14px;display:flex;flex-direction:column;gap:12px}
.ezg-object-body input,.ezg-object-body .ezg-select,.ezg-object-body textarea{width:100%;max-width:100%;min-width:0}
.ezg-object-body input[type=checkbox]{width:auto;align-self:flex-start}.ezg-object-body input[type=color]{width:100%;height:30px;padding:3px}
.ezg-object-preview{min-height:120px;height:120px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:6px;background:var(--ezg-surface);color:var(--ezygrid-text,#0f172a);padding:8px}
.ezg-object-preview svg,.ezg-object-preview img{max-width:100%;max-height:100%;object-fit:contain}.ezg-object-preview svg{width:100%;height:100%}
.ezg-object-error{font-size:12px;line-height:1.5;margin:0;overflow-wrap:anywhere}.ezg-object-error:empty{display:none}
.ezg-object-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ezygrid-suite .ezg-object-choices button{flex-direction:column;white-space:normal;padding:6px;font-size:12px;min-width:0;border-color:var(--ezygrid-gridline,#e2e8f0)}
.ezg-chart-sample{width:100%;height:36px;display:block}.ezygrid-suite .ezg-chart-sample svg{width:100%;height:100%}
.ezg-shape-sample{display:flex;align-items:center;justify-content:center;width:45px;height:30px;border:1px solid currentColor;margin:5px}.ezg-shape-ellipse{border-radius:50%}.ezg-shape-textbox{border-style:dashed}
.ezg-shape-preview{display:flex;align-items:center;justify-content:center;max-height:150px;overflow:hidden;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.ezg-object-colors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ezg-object-advanced summary,.ezg-object-list summary{cursor:pointer;font-size:12px;font-weight:600;padding:10px 0}.ezg-object-advanced>.ezg-form{padding:8px 0}
.ezg-object-footer{display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;padding:12px 14px;border-top:1px solid var(--ezygrid-gridline,#e2e8f0);background:var(--ezygrid-bg,#fff)}
.ezg-object-list-row{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:12px;margin:6px 0}.ezg-object-list-row>span{width:100%;overflow-wrap:anywhere}.ezg-image-upload{border:1px dashed var(--ezygrid-gridline,#e2e8f0);padding:12px;border-radius:6px}
.ezygrid-object-content{user-select:none}.ezygrid-object-content img{-webkit-user-drag:none}
.ezg-table-selection{border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:6px;padding:10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px}.ezg-table-selection strong{flex:1}.ezg-table-selection .ezg-hint{margin:0}.ezg-table-selection button{width:100%;justify-content:flex-start}
.ezg-table-check{display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.5}.ezygrid-suite .ezg-table-check input{width:auto;min-height:16px;margin:0;flex-shrink:0}
.ezg-table-preview-label{font-size:12px;font-weight:600}.ezg-table-preview{border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:6px;overflow:hidden;min-height:70px}.ezg-table-preview>.ezg-hint{padding:10px}.ezg-table-preview table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:12px}.ezg-table-preview th,.ezg-table-preview td{padding:8px 6px;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0)}.ezg-table-preview tr:last-child td{border-bottom:0}.ezg-table-band{background:var(--ezygrid-table-band,rgba(0,0,0,.03))}.ezg-table-last-row{font-weight:700}.ezg-table-footer{flex-wrap:wrap}.ezg-table-body>*{flex-shrink:0}.ezg-table-body>.ezg-hint{margin:0}
.ezg-layout-ribbon-controls{display:flex;flex-direction:column;gap:4px}.ezg-layout-ribbon-actions{display:flex;align-items:center;gap:3px}.ezygrid-suite .ezg-layout-ribbon-actions button,.ezygrid-suite .ezg-layout-ribbon-size button{width:30px;min-width:30px;min-height:30px;padding:5px}.ezg-layout-ribbon-size{display:flex;align-items:center;gap:5px;font-size:11px}.ezg-layout-ribbon-size label{display:flex;align-items:center;gap:6px}.ezygrid-suite .ezg-layout-ribbon-size input{width:70px;min-width:0}.ezg-ribbon-error{margin:0;max-width:390px;font-size:11px;line-height:1.3;white-space:normal;overflow-wrap:anywhere}.ezg-ribbon-error:empty{display:none}.ezg-headers-ribbon-group .ezg-select{width:80px;font-size:11px}.ezg-headers-ribbon-group .ezg-select[aria-label="Header group"]{width:120px}.ezygrid-suite .ezg-headers-ribbon-group .ezg-header-label-input{width:130px;min-width:0;font-size:12px}.ezygrid-suite .ezg-headers-ribbon-group .ezg-header-column-input{width:42px;min-width:0;font-size:12px}.ezg-header-range-dash{font-size:12px;color:var(--ezg-muted)}
.ezg-ribbon-menu{position:fixed;inset:auto;margin:0;min-width:180px;padding:4px;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:6px;background:var(--ezygrid-bg,#fff);color:var(--ezygrid-text,#0f172a);box-shadow:0 8px 28px #0002;overflow:auto;font:inherit}.ezg-ribbon-menu:popover-open{display:flex;flex-direction:column;gap:2px}.ezg-ribbon-menu button{width:100%;justify-content:flex-start;text-align:start}
.ezg-ribbon-preview-popup{position:fixed;inset:auto;margin:0;width:340px;box-sizing:border-box;padding:12px;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:8px;background:var(--ezygrid-bg,#fff);color:var(--ezygrid-text,#0f172a);box-shadow:0 8px 28px #0002;overflow:auto;font:inherit}.ezg-headers-preview{border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:6px;overflow:hidden}.ezg-header-preview-row{display:grid;grid-template-columns:repeat(var(--ezg-preview-columns,8),minmax(0,1fr));min-height:30px;background:var(--ezg-surface)}.ezg-header-preview-row span{padding:7px 2px;border-inline-end:1px solid var(--ezygrid-gridline,#e2e8f0);border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0);font-size:11px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ezg-header-preview-letters span{border-bottom:0;color:var(--ezg-muted)}.ezg-headers-paging{display:flex;align-items:center;justify-content:space-between;font-size:12px}.ezg-headers-paging button:first-child svg{transform:rotate(90deg)}.ezg-headers-paging button:last-child svg{transform:rotate(-90deg)}

.ezygrid-suite .ezg-tabs{overflow-x:auto;flex-shrink:0;min-width:0}
.ezygrid-suite .ezg-tabs>button{flex-shrink:0}
.ezygrid-suite .ezg-group{flex-shrink:0}
.ezygrid-suite .ezg-tools-controls{display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,32px);grid-auto-columns:max-content;align-items:center;gap:4px 6px}
.ezygrid-suite .ezg-controls{display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,32px);grid-auto-columns:max-content;align-items:center;gap:4px}
.ezygrid-suite .ezg-tools-controls>button{justify-content:flex-start;font-size:12px;min-height:30px}
.ezygrid-suite .ezg-ribbon-field{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:11px;min-width:0}
.ezygrid-suite .ezg-ribbon-field input:not([type=checkbox]):not([type=color]),.ezygrid-suite .ezg-ribbon-field .ezg-select{width:124px;font-size:12px;min-height:28px;height:28px;padding:2px 6px}
.ezygrid-suite .ezg-ribbon-field input[type=number]{width:68px!important}
.ezygrid-suite .ezg-ribbon-field input[type=color]{width:32px;height:28px;min-height:28px}
.ezygrid-suite .ezg-ribbon-field input[type=checkbox]{order:-1;margin:0}
.ezygrid-suite .ezg-ribbon-note{grid-row:span 2}
.ezygrid-suite .ezg-ribbon-note textarea{width:220px;height:60px;min-height:0;padding:4px 6px;resize:none;font-size:12px}
.ezygrid-suite .ezg-tool-dialog{width:min(560px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);color:var(--ezygrid-text,#0f172a)}
.ezygrid-suite .ezg-tool-dialog>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.ezygrid-suite .ezg-tool-dialog>header h2{margin:0;font-size:16px}
.ezygrid-suite .ezg-tool-dialog>header button{flex-shrink:0}
.ezygrid-suite .ezg-tool-dialog .ezg-object-body{overflow:visible}
.ezygrid-suite .ezg-tool-dialog .ezg-form>button[type=submit]{align-self:flex-end}
.ezygrid-suite .ezg-dialog .ezg-message{position:static;max-width:none;margin-top:12px}
${suiteTopbarStyles}
.ezygrid-suite > .ezy-suite-topbar{--suite-export-bg:var(--ezygrid-selection,#00c47a);--suite-export-text:#052e24}
`;

export function installEditorStyles(doc: Document): void {
  if (doc.querySelector('style[data-ezygrid-editor]')) return;
  const style = doc.createElement('style');
  style.dataset.ezygridEditor = '';
  style.textContent = editorStyles;
  doc.head.appendChild(style);
}
