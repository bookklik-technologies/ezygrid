document.currentScript.__ezygridRegister("core/ui/cell-style", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyStyle = applyStyle;
/** Shared cell typography and borders, including recycled and frozen cells. */
function applyStyle(element, style, zoom = 1) {
    const css = element.style;
    css.fontFamily = style.fontFamily ?? 'inherit';
    css.fontSize = style.fontSize ? `${style.fontSize * zoom}px` : '';
    css.whiteSpace = style.wrap ? 'pre-wrap' : 'pre';
    css.overflowWrap = style.wrap ? 'anywhere' : 'normal';
    css.lineHeight = '1.45';
    css.display = 'flex';
    css.flexDirection = 'column';
    css.justifyContent = style.verticalAlign === 'bottom' ? 'flex-end' : style.verticalAlign === 'middle' ? 'center' : 'flex-start';
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        const border = style.borders?.[edge];
        css.setProperty(`border-${edge}`, border
            ? `${border.width}px ${border.style} ${border.color}`
            : border === null ? 'none' : edge === 'right' || edge === 'bottom' ? '1px solid var(--ezygrid-gridline, #e2e8f0)' : 'none');
    }
}

});
