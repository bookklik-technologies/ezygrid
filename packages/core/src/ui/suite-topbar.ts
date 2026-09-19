// Ezy suite topbar contract. Keep the local copies in all three repositories aligned.
type Parts = {
  brand: HTMLElement; title: HTMLInputElement; history: HTMLElement;
  specialist?: HTMLElement; view: HTMLElement; files: HTMLElement;
  exportControl: HTMLElement; more?: HTMLDetailsElement;
};

// Lucide ellipsis-vertical (ISC), matching the existing suite icon set.
const moreIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';

function positionPanel(panel: HTMLElement, anchor: HTMLElement): void {
  const win = anchor.ownerDocument.defaultView!;
  const rect = anchor.getBoundingClientRect();
  panel.style.maxHeight = `${Math.max(80, win.innerHeight - 16)}px`;
  panel.style.maxWidth = `${Math.max(0, win.innerWidth - 16)}px`;
  const size = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(8, Math.min(rect.right - size.width, win.innerWidth - size.width - 8))}px`;
  panel.style.top = `${Math.max(8, Math.min(rect.bottom + 4, win.innerHeight - size.height - 8))}px`;
}

function visibleControls(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [role="menuitem"]'))
    .filter(item => item.getClientRects().length > 0);
}

function closeNestedMenus(container: HTMLElement): void {
  for (const nested of container.querySelectorAll<HTMLDetailsElement>('details[open]')) {
    nested.open = false;
    for (const panel of nested.querySelectorAll<HTMLElement>(':popover-open')) panel.hidePopover();
  }
}

/** Native details semantics, with a top-layer panel for clipped embedded editors. */
export function bindSuiteMenu(details: HTMLDetailsElement, panel: HTMLElement): () => void {
  const doc = details.ownerDocument;
  const win = doc.defaultView!;
  const summary = details.querySelector<HTMLElement>('summary')!;
  panel.classList.add('ezy-suite-popup');
  panel.setAttribute('popover', 'manual');
  summary.setAttribute('aria-expanded', 'false');
  const position = (): void => { if (details.open) positionPanel(panel, summary); };
  const close = (restore = false): void => {
    if (!details.open) return;
    if (restore) summary.focus();
    closeNestedMenus(panel);
    details.open = false;
    if (panel.matches(':popover-open')) panel.hidePopover();
    summary.setAttribute('aria-expanded', 'false');
  };
  const toggle = (): void => {
    summary.setAttribute('aria-expanded', String(details.open));
    if (details.open) {
      if (panel.showPopover && !panel.matches(':popover-open')) panel.showPopover();
      position();
      visibleControls(panel)[0]?.focus();
    } else {
      closeNestedMenus(panel);
      if (panel.matches(':popover-open')) panel.hidePopover();
    }
  };
  const outside = (event: Event): void => {
    if (!details.contains(event.target as Node)) close();
  };
  const keydown = (event: KeyboardEvent): void => {
    if (!details.open) {
      if (event.target === summary && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); details.open = true;
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = visibleControls(panel);
      const index = items.indexOf(doc.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus(); event.preventDefault(); event.stopPropagation();
    }
  };
  const click = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest('button');
    if (target && target.closest('details') === details && !target.disabled) {
      close(panel.contains(doc.activeElement));
    }
  };
  const focusout = (event: FocusEvent): void => {
    // activeElement can be the body while focus moves between menu options.
    if (!details.contains(event.relatedTarget as Node | null)) close();
  };
  details.addEventListener('toggle', toggle);
  details.addEventListener('keydown', keydown);
  details.addEventListener('focusout', focusout);
  panel.addEventListener('click', click);
  doc.addEventListener('pointerdown', outside, true);
  doc.addEventListener('scroll', position, true);
  win.addEventListener('resize', position);
  return () => {
    close();
    details.removeEventListener('toggle', toggle);
    details.removeEventListener('keydown', keydown);
    details.removeEventListener('focusout', focusout);
    panel.removeEventListener('click', click);
    doc.removeEventListener('pointerdown', outside, true);
    doc.removeEventListener('scroll', position, true);
    win.removeEventListener('resize', position);
  };
}

export function installSuiteTopbar(root: HTMLElement, bar: HTMLElement, parts: Parts): () => void {
  const doc = bar.ownerDocument;
  root.classList.add('ezy-suite-host');
  bar.classList.add('ezy-suite-topbar');
  parts.brand.classList.add('ezy-suite-brand');
  parts.title.classList.add('ezy-suite-title');
  parts.exportControl.classList.add('ezy-suite-export');
  const more = parts.more ?? doc.createElement('details');
  more.classList.add('ezy-suite-more');
  if (!parts.more) {
    const summary = doc.createElement('summary');
    summary.innerHTML = moreIcon;
    const panel = doc.createElement('div');
    more.append(summary, panel);
  }
  const summary = more.querySelector<HTMLElement>('summary')!;
  summary.setAttribute('aria-label', 'More actions');
  summary.title = 'More actions';
  const panel = more.children[1] as HTMLElement;
  panel.classList.add('ezy-suite-overflow');
  panel.setAttribute('aria-label', 'More actions');
  const extras = doc.createElement('div');
  extras.className = 'ezy-suite-extras';
  extras.append(...Array.from(panel.childNodes));
  panel.append(extras);
  const groups = [parts.history, parts.specialist, parts.view, parts.files].filter((g): g is HTMLElement => !!g);
  for (const group of groups) {
    group.className = 'ezy-suite-group';
    group.setAttribute('role', 'group');
    for (const control of group.querySelectorAll<HTMLElement>('button, summary')) {
      if (!control.getAttribute('aria-label')) control.setAttribute('aria-label', control.title || control.textContent?.trim() || 'Action');
      if (!control.title) control.title = control.getAttribute('aria-label')!;
      if (!control.textContent?.trim() || control.querySelector('.ez-visually-hidden')) control.classList.add('ezy-suite-icon');
    }
  }
  const actions = doc.createElement('div');
  actions.className = 'ezy-suite-actions';
  actions.append(parts.history);
  if (parts.specialist) actions.append(parts.specialist);
  actions.append(parts.view, more, parts.files, parts.exportControl);
  const slots = groups.map(group => {
    const slot = doc.createComment('topbar action group');
    group.before(slot);
    return { group, slot };
  });
  bar.replaceChildren(parts.brand, parts.title, actions);
  const cleanupMenu = bindSuiteMenu(more, panel);
  let previous = '';
  const layout = (): void => {
    const width = root.getBoundingClientRect().width;
    const density = width < 480 ? 'small' : width < 800 ? 'compact' : width < 1100 ? 'medium' : 'full';
    if (density === previous) return;
    previous = density;
    const focused = doc.activeElement as HTMLElement | null;
    closeNestedMenus(bar);
    more.open = false;
    bar.dataset.density = density;
    for (const { group, slot } of slots) {
      const overflow = group === parts.specialist ? width < 1100 : group === parts.history ? width < 480 : width < 800;
      if (overflow) panel.insertBefore(group, extras);
      else slot.after(group);
    }
    more.hidden = panel.children.length === 1 && !extras.children.length;
    if (focused && panel.contains(focused)) summary.focus();
    else if (more.hidden && focused === summary) parts.title.focus();
  };
  const observer = new ResizeObserver(layout);
  observer.observe(root);
  layout();
  return () => { observer.disconnect(); cleanupMenu(); };
}

/** Accessible transient menus used by the grid and design editor topbars. */
export function openSuiteMenu(anchor: HTMLElement, items: { label: string; action: () => void; disabled?: boolean }[]): () => void {
  const doc = anchor.ownerDocument;
  const bar = anchor.closest<HTMLElement>('.ezy-suite-topbar')!;
  const panel = doc.createElement('div');
  panel.className = 'ezy-suite-popup ezy-suite-transient';
  panel.setAttribute('popover', 'manual');
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', anchor.getAttribute('aria-label') || anchor.title || 'Actions');
  const returnFocus = (): void => {
    (anchor.getClientRects().length ? anchor : bar.querySelector<HTMLElement>('.ezy-suite-more > summary'))?.focus();
  };
  const close = (restore = false): void => {
    if (restore) returnFocus();
    panel.remove();
    anchor.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', outside, true);
    doc.removeEventListener('scroll', reposition, true);
    doc.defaultView!.removeEventListener('resize', dismiss);
  };
  const outside = (event: Event): void => { if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) close(); };
  const dismiss = (): void => close(panel.contains(doc.activeElement));
  const reposition = (): void => { if (anchor.getClientRects().length) positionPanel(panel, anchor); else dismiss(); };
  for (const item of items) {
    const button = doc.createElement('button');
    button.type = 'button'; button.textContent = item.label; button.disabled = !!item.disabled;
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => { close(true); item.action(); });
    panel.append(button);
  }
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const controls = visibleControls(panel);
      const index = controls.indexOf(doc.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + controls.length) % controls.length;
      controls[next]?.focus(); event.preventDefault(); event.stopPropagation();
    }
  });
  panel.addEventListener('focusout', event => {
    if (!panel.contains(event.relatedTarget as Node | null)) close();
  });
  bar.append(panel);
  if (panel.showPopover) panel.showPopover();
  positionPanel(panel, anchor);
  anchor.setAttribute('aria-expanded', 'true');
  visibleControls(panel)[0]?.focus();
  doc.addEventListener('pointerdown', outside, true);
  doc.addEventListener('scroll', reposition, true);
  doc.defaultView!.addEventListener('resize', dismiss);
  return () => close();
}
