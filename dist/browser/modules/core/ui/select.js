document.currentScript.__ezygridRegister("core/ui/select", function(require, module, exports) {
"use strict";
/**
 * Custom dropdown control — a visually consistent replacement for native
 * `<select>` elements across the grid editor, ribbon, and dialogs.
 *
 * The control mimics the `HTMLSelectElement` surface the shell relies on:
 * a `value` property, `disabled`, `reportValidity()`, bubbled `change`
 * events on user selection, and keyboard support (arrows, Home/End,
 * Enter/Space, Escape, outside dismissal, focus return, viewport clamping).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSelect = createSelect;
const SVG_NS = 'http://www.w3.org/2000/svg';
let sequence = 0;
const normalize = (options) => (options ?? []).map((option) => (typeof option === 'string' ? { value: option } : option));
function createSelect(doc, spec = {}) {
    let options = normalize(spec.options);
    let value = spec.value ?? options[0]?.value ?? '';
    let disabled = false;
    let open = false;
    let active = 0;
    const id = `ezg-select-${++sequence}`;
    const root = doc.createElement('div');
    root.className = 'ezg-select';
    root.setAttribute('role', 'combobox');
    root.setAttribute('aria-haspopup', 'listbox');
    root.setAttribute('aria-expanded', 'false');
    root.tabIndex = 0;
    if (spec.label)
        root.setAttribute('aria-label', spec.label);
    const display = doc.createElement('span');
    display.className = 'ezg-select-value';
    const chevron = doc.createElementNS(SVG_NS, 'svg');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    chevron.setAttribute('stroke-linecap', 'round');
    chevron.setAttribute('stroke-linejoin', 'round');
    chevron.setAttribute('aria-hidden', 'true');
    const stroke = doc.createElementNS(SVG_NS, 'path');
    stroke.setAttribute('d', 'm6 9 6 6 6-6');
    chevron.append(stroke);
    const menu = doc.createElement('div');
    menu.className = 'ezg-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('popover', 'manual');
    menu.hidden = true;
    root.append(display, chevron);
    Object.assign(root.style, {
        display: 'inline-flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        minWidth: '0',
        minHeight: '28px',
        padding: '2px 6px 2px 8px',
        border: '1px solid var(--ezygrid-gridline, #e2e8f0)',
        borderRadius: '6px',
        background: 'var(--ezygrid-bg, #fff)',
        color: 'inherit',
        cursor: 'pointer',
        userSelect: 'none',
    });
    Object.assign(display.style, {
        flex: '1',
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    });
    Object.assign(chevron.style, {
        width: '14px',
        height: '14px',
        flexShrink: '0',
        transition: 'transform .15s ease',
    });
    Object.assign(menu.style, {
        position: 'fixed',
        boxSizing: 'border-box',
        margin: '0',
        width: 'max-content',
        maxHeight: '220px',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        padding: '4px',
        border: '1px solid var(--ezygrid-gridline, #e2e8f0)',
        borderRadius: '8px',
        background: 'var(--ezygrid-bg, #fff)',
        color: 'var(--ezygrid-text, #0f172a)',
        boxShadow: '0 8px 28px rgba(15,15,20,.13), 0 2px 6px rgba(15,15,20,.05)',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        zIndex: '1150',
    });
    const rows = [];
    const labelOf = (entry) => entry.label ?? entry.value;
    function paint() {
        if (active >= options.length)
            active = Math.max(0, options.length - 1);
        const label = value === '' ? (spec.placeholder ?? '') : labelOf(options.find((entry) => entry.value === value) ?? { value });
        display.textContent = label;
        for (const [index, row] of rows.entries()) {
            const selected = options[index]?.value === value;
            row.setAttribute('aria-selected', String(selected));
            row.style.background = open && index === active ? 'var(--ezygrid-selection-soft, #e6fff4)' : '';
            row.style.fontWeight = selected ? '600' : '';
        }
        root.setAttribute('aria-expanded', String(open));
        root.setAttribute('aria-disabled', String(disabled));
        root.setAttribute('aria-activedescendant', open ? rows[active]?.id ?? '' : '');
        chevron.style.transform = open ? 'rotate(180deg)' : '';
        root.style.opacity = disabled ? '.45' : '';
        root.style.cursor = disabled ? 'default' : 'pointer';
        menu.hidden = !open;
    }
    function setActive(index) {
        active = Math.max(0, Math.min(options.length - 1, index));
        paint();
        rows[active]?.scrollIntoView?.({ block: 'nearest' });
    }
    function rebuild() {
        menu.replaceChildren();
        rows.length = 0;
        options.forEach((entry, index) => {
            const row = doc.createElement('div');
            row.className = 'ezg-select-option';
            row.id = `${id}-opt-${index}`;
            row.setAttribute('role', 'option');
            row.dataset.value = entry.value;
            row.textContent = labelOf(entry);
            if (entry.title)
                row.title = entry.title;
            Object.assign(row.style, {
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
            });
            row.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                select(index);
            });
            row.addEventListener('mousemove', () => setActive(index));
            menu.append(row);
            rows.push(row);
        });
        paint();
    }
    function popupHost() {
        return spec.popupHost ?? root.parentElement ?? doc.body;
    }
    function position() {
        const win = doc.defaultView;
        if (!win)
            return;
        const rect = root.getBoundingClientRect();
        const availWidth = win.innerWidth || rect.width;
        const availHeight = win.innerHeight || rect.height + 260;
        // Neutralize the popover UA styles (inset: 0; margin: auto), then probe the
        // real containing-block origin: containment, transforms, or the top layer
        // can make fixed coordinates relative to something other than the viewport.
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.left = '0px';
        menu.style.top = '0px';
        menu.style.minWidth = `${rect.width}px`;
        menu.style.maxWidth = `${Math.max(160, availWidth - 16)}px`;
        const offsetX = menu.getBoundingClientRect().left;
        const offsetY = menu.getBoundingClientRect().top;
        const width = menu.getBoundingClientRect().width || rect.width;
        const height = menu.getBoundingClientRect().height || Math.min(rows.length * 28 + 8, 220);
        const left = Math.max(8, Math.min(rect.left, availWidth - width - 8));
        const below = availHeight - rect.bottom;
        const top = below < height + 12 && rect.top > height + 12 ? rect.top - height - 4 : rect.bottom + 2;
        menu.style.left = `${left - offsetX}px`;
        menu.style.top = `${Math.max(8, Math.min(top, Math.max(8, availHeight - height - 8))) - offsetY}px`;
    }
    const outside = (event) => {
        const target = event.target;
        if (root.contains(target) || menu.contains(target))
            return;
        closeMenu(true);
    };
    const onScroll = (event) => {
        if (menu.contains(event.target))
            return;
        closeMenu(true);
    };
    function openMenu() {
        if (open || disabled || !options.length)
            return;
        open = true;
        active = Math.max(0, options.findIndex((entry) => entry.value === value));
        popupHost().append(menu);
        menu.hidden = false;
        if (typeof menu.showPopover === 'function') {
            try {
                menu.showPopover();
            }
            catch { /* popover unsupported */ }
        }
        position();
        paint();
        setActive(active);
        doc.addEventListener('pointerdown', outside, true);
        doc.addEventListener('scroll', onScroll, true);
        doc.defaultView?.addEventListener('resize', onResize);
    }
    function onResize() {
        closeMenu(true);
    }
    function closeMenu(focusBack = false) {
        if (!open)
            return;
        open = false;
        paint();
        if (typeof menu.hidePopover === 'function') {
            try {
                menu.hidePopover();
            }
            catch { /* popover unsupported */ }
        }
        menu.hidden = true;
        doc.removeEventListener('pointerdown', outside, true);
        doc.removeEventListener('scroll', onScroll, true);
        doc.defaultView?.removeEventListener('resize', onResize);
        if (focusBack && root.isConnected)
            root.focus({ preventScroll: true });
    }
    function select(index) {
        const entry = options[index];
        if (!entry)
            return;
        value = entry.value;
        closeMenu(true);
        paint();
        root.dispatchEvent(new Event('change', { bubbles: true }));
    }
    root.addEventListener('mousedown', (event) => {
        if (disabled || menu.contains(event.target))
            return;
        event.preventDefault();
        if (doc.activeElement !== root)
            root.focus({ preventScroll: true });
        if (open)
            closeMenu();
        else
            openMenu();
    });
    root.addEventListener('blur', () => closeMenu());
    root.addEventListener('keydown', (event) => {
        if (disabled || event.isComposing || event.keyCode === 229)
            return;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!open) {
                    openMenu();
                    break;
                }
                setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
                break;
            }
            case 'Home':
            case 'End': {
                if (!open)
                    return;
                event.preventDefault();
                event.stopImmediatePropagation();
                setActive(event.key === 'Home' ? 0 : options.length - 1);
                break;
            }
            case 'Enter': {
                if (!open)
                    return;
                event.preventDefault();
                event.stopImmediatePropagation();
                select(active);
                break;
            }
            case ' ': {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (open)
                    select(active);
                else
                    openMenu();
                break;
            }
            case 'Escape': {
                if (!open)
                    return;
                event.preventDefault();
                event.stopImmediatePropagation();
                closeMenu(true);
                break;
            }
            case 'Tab': {
                if (open)
                    closeMenu();
                break;
            }
            default:
        }
    });
    rebuild();
    Object.defineProperties(root, {
        value: {
            get: () => value,
            set: (next) => { value = String(next); paint(); },
            configurable: true,
        },
        disabled: {
            get: () => disabled,
            set: (next) => { disabled = Boolean(next); if (disabled)
                closeMenu(); paint(); },
            configurable: true,
        },
        reportValidity: {
            value: () => !disabled,
            configurable: true,
        },
        setOptions: {
            value: (next) => { options = normalize(next); rebuild(); },
            configurable: true,
        },
        destroy: {
            value: () => { closeMenu(); menu.remove(); root.remove(); },
            configurable: true,
        },
    });
    return root;
}

});
