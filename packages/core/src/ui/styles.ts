import { suiteTopbarStyles } from './suite-topbar-styles.js';

export const editorStyles = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
.ezygrid-suite{--ezg-surface:#f7f9fb;--ezg-muted:#64748b;position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:220px;overflow:hidden;box-sizing:border-box;border:1px solid var(--ezygrid-gridline,#e2e8f0);border-radius:0px;background:var(--ezygrid-bg,#fff);color:var(--ezygrid-text,#0f172a);font:13px Outfit,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,Roboto,'Helvetica Neue',sans-serif;isolation:isolate}
.ezygrid-suite[data-theme=dark]{--ezg-surface:#16223a;--ezg-muted:#94a3b8;--ezygrid-bg:#0f172a;--ezygrid-text:#e2e8f0;--ezygrid-gridline:#334155;--ezygrid-header-bg:#16223a;--ezygrid-header-text:#94a3b8;--ezygrid-selection:#00ff99;--ezygrid-selection-soft:rgba(0,255,153,.16);color-scheme:dark}
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
.ezg-tabs{display:flex;align-items:center;gap:2px;padding:3px 10px 0;overflow-x:auto;flex-shrink:0;border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezg-tabs button{border-radius:6px 6px 0 0;padding:6px 13px}
.ezg-ribbon{display:flex;gap:0;padding:8px;min-height:82px;overflow-x:auto;flex-shrink:0;background:var(--ezg-surface);border-bottom:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezg-group{display:flex;flex-direction:column;justify-content:space-between;gap:5px;padding:0 10px;border-inline-end:1px solid var(--ezygrid-gridline,#e2e8f0)}
.ezg-group:last-child{border:0}.ezg-group-label{font-size:10px;color:var(--ezg-muted);text-align:center;letter-spacing:.02em}
.ezg-controls{display:flex;align-items:center;gap:3px;min-height:36px}.ezg-controls select{max-width:135px}.ezg-controls input[type=number]{width:57px}
.ezg-main{display:flex;flex:1;min-height:0;min-width:0;position:relative}.ezg-viewport{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden}
.ezg-bottom{display:flex;align-items:center;gap:8px;min-height:36px;flex-shrink:0;padding:2px 8px;border-top:1px solid var(--ezygrid-gridline,#e2e8f0);background:var(--ezg-surface)}
.ezg-sheets{display:flex;align-items:center;gap:3px;overflow-x:auto;min-width:0;flex:1}.ezg-sheets button{font-size:12px;min-height:28px}.ezg-stats{color:var(--ezg-muted);white-space:nowrap;font-size:11px}
.ezg-panel{width:300px;flex-shrink:0;overflow-y:auto;border-inline-start:1px solid var(--ezygrid-gridline,#e2e8f0);padding:14px;background:var(--ezygrid-bg,#fff);user-select:text}
.ezg-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.ezg-panel h2{font-size:15px;margin:0;font-weight:600}
.ezg-form{display:flex;flex-direction:column;gap:11px}.ezg-field{display:flex;flex-direction:column;gap:4px;font-size:12px}.ezg-field textarea{min-height:75px;resize:vertical}.ezg-field select{width:100%}.ezg-field input[type=checkbox]{align-self:flex-start}
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
@media(max-width:700px){.ezg-brand{font-size:0;margin:0}.ezg-title{width:110px}.ezg-topbar{gap:3px;padding:6px}.ezg-topbar .ezg-optional{display:none}.ezg-stats{display:none}.ezg-panel{position:absolute;inset-inline-end:0;top:0;bottom:0;width:min(300px,90%);z-index:20;box-shadow:-4px 0 20px #0001}.ezg-tabs button{padding:6px 9px}}
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
