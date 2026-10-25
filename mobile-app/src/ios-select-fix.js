/*
 * iOS Safari uses a full-screen, blurred native picker for <select>.
 * Keep the real form control as the source of truth and replace only its
 * touch UI with a lightweight, accessible listbox on Apple touch browsers.
 * All other browsers continue using native selects.
 */
const isIosSafari = () => {
  const ua = navigator.userAgent || '';
  const appleTouch = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleTouch && /AppleWebKit/.test(ua);
};

export function installIosSelectFix() {
  if (typeof document === 'undefined' || !isIosSafari()) return false;
  if (document.documentElement.hasAttribute('data-imsg-ios-selects')) return true;
  document.documentElement.setAttribute('data-imsg-ios-selects', '');

  const enhanced = new WeakMap();
  let active = null;
  let counter = 0;

  function currentText(select) {
    return Array.from(select.selectedOptions || []).map(option => option.label || option.textContent).join('، ') || '—';
  }

  function sync(select) {
    const item = enhanced.get(select);
    if (!item) return;
    const { trigger } = item;
    trigger.querySelector('.imsg-ios-select-value').textContent = currentText(select);
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-required', select.required ? 'true' : 'false');
    trigger.setAttribute('aria-invalid', select.validity?.valid === false ? 'true' : 'false');
    trigger.title = currentText(select);
  }

  function close(restoreFocus = false) {
    if (!active) return;
    const { menu, trigger } = active;
    active = null;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    menu.remove();
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function positionMenu(menu, trigger) {
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const vw = viewport?.width || window.innerWidth;
    const vh = viewport?.height || window.innerHeight;
    const x = viewport?.offsetLeft || 0;
    const y = viewport?.offsetTop || 0;
    const width = Math.min(vw - 24, Math.max(220, rect.width));
    const availableBelow = y + vh - rect.bottom - 12;
    const availableAbove = rect.top - y - 12;
    const below = availableBelow >= 190 || availableBelow >= availableAbove;
    const height = Math.max(110, Math.min(340, below ? availableBelow : availableAbove));
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(x + 12, Math.min(rect.left, x + vw - width - 12))}px`;
    menu.style.top = below ? `${rect.bottom + 5}px` : `${Math.max(y + 12, rect.top - height - 5)}px`;
  }

  function open(select, trigger) {
    if (select.disabled || !select.isConnected) return;
    close();
    sync(select);
    const menu = document.createElement('div');
    menu.className = 'imsg-ios-select-menu';
    menu.id = `imsg-ios-options-${++counter}`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label') || 'Options');
    menu.dir = select.dir || document.documentElement.dir || 'rtl';
    const options = Array.from(select.options);
    let firstEnabled = null;
    let selectedButton = null;
    for (const [index, option] of options.entries()) {
      if (option.hidden) continue;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'imsg-ios-select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', option.selected ? 'true' : 'false');
      item.disabled = option.disabled || option.parentElement?.disabled === true;
      item.textContent = option.label || option.textContent || '—';
      item.dataset.index = String(index);
      if (option.selected) selectedButton = item;
      if (!item.disabled && !firstEnabled) firstEnabled = item;
      item.addEventListener('click', event => {
        event.preventDefault();
        if (item.disabled) return;
        const previous = select.selectedIndex;
        select.selectedIndex = index;
        close(true);
        sync(select);
        if (previous !== index) {
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      menu.append(item);
    }
    if (!menu.children.length) return;
    // A native <dialog> is in the browser's top layer; put the list there too.
    const dialog = select.closest('dialog[open]');
    (dialog || document.body).append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', menu.id);
    active = { menu, trigger, select };
    positionMenu(menu, trigger);
    if (selectedButton) menu.scrollTop = Math.max(0, selectedButton.offsetTop - menu.offsetTop - menu.clientHeight / 2);
  }

  function enhance(select) {
    if (enhanced.has(select) || select.multiple || select.size > 1 || select.hasAttribute('data-native-select')) return;
    const computed = window.getComputedStyle(select);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'imsg-ios-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = select.getAttribute('aria-label') ||
      select.labels?.[0]?.querySelector('span')?.textContent?.trim() ||
      select.labels?.[0]?.textContent?.split('\n')[0]?.trim() ||
      select.name || 'Choose an option';
    trigger.setAttribute('aria-label', label);
    const value = document.createElement('span');
    value.className = 'imsg-ios-select-value';
    const arrow = document.createElement('span');
    arrow.className = 'imsg-ios-select-chevron';
    arrow.textContent = '⌄';
    arrow.setAttribute('aria-hidden', 'true');
    trigger.append(value, arrow);

    // Mirror the existing select's design, whether it is inside a form, a
    // toolbar, or the studio dialog. Do not modify its name or form values.
    for (const property of ['color', 'backgroundColor', 'border', 'borderRadius', 'boxShadow',
      'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'fontFamily', 'fontSize',
      'fontWeight', 'lineHeight', 'minHeight', 'maxWidth', 'marginTop', 'marginBottom',
      'marginLeft', 'marginRight', 'alignSelf', 'flex', 'order']) {
      trigger.style[property] = computed[property];
    }
    const parentWidth = select.parentElement?.getBoundingClientRect().width || 0;
    const selectWidth = select.getBoundingClientRect().width;
    const fillsParent = parentWidth > 0 && Math.abs(selectWidth - parentWidth) < 5;
    trigger.style.width = select.style.width || (fillsParent ? '100%' : (selectWidth > 0 ? `${selectWidth}px` : '100%'));
    trigger.style.minWidth = '0';
    trigger.dir = select.dir || document.documentElement.dir || 'rtl';
    select.insertAdjacentElement('afterend', trigger);
    select.classList.add('imsg-ios-select-source');
    select.setAttribute('tabindex', '-1');
    enhanced.set(select, { trigger });
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (active?.select === select) close(true);
      else open(select, trigger);
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Escape') { if (active?.select === select) { event.preventDefault(); close(true); } return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        if (!active || active.select !== select) open(select, trigger);
        const buttons = [...(active?.menu.querySelectorAll('.imsg-ios-select-option:not(:disabled)') || [])];
        if (!buttons.length) return;
        const focused = buttons.indexOf(document.activeElement);
        let next = focused;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, focused + 1);
        else if (event.key === 'ArrowUp') next = focused < 0 ? buttons.length - 1 : Math.max(0, focused - 1);
        else if (focused < 0) next = Math.max(0, buttons.findIndex(button => button.getAttribute('aria-selected') === 'true'));
        buttons[next]?.focus();
      }
    });
    select.addEventListener('change', () => sync(select));
    select.addEventListener('input', () => sync(select));
    select.addEventListener('invalid', event => {
      event.preventDefault();
      open(select, trigger);
      trigger.setAttribute('aria-invalid', 'true');
      trigger.focus({ preventScroll: true });
    });
    select.form?.addEventListener('reset', () => setTimeout(() => sync(select), 0));
    new MutationObserver(() => sync(select)).observe(select, {
      attributes: true, attributeFilter: ['disabled', 'required'], childList: true, subtree: true
    });
    sync(select);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches?.('select')) enhance(root);
    root.querySelectorAll?.('select').forEach(enhance);
  }

  document.addEventListener('click', event => {
    // An explicit <label for="..."> must open our picker, not focus hidden iOS UI.
    const label = event.target.closest?.('label');
    if (!label || event.target.closest?.('button,input,textarea,a')) return;
    const select = label.control;
    if (!select || !enhanced.has(select)) return;
    event.preventDefault();
    const trigger = enhanced.get(select).trigger;
    if (trigger.isConnected) trigger.click();
  }, true);
  document.addEventListener('pointerdown', event => {
    if (active && !active.menu.contains(event.target) && !active.trigger.contains(event.target)) close();
  }, true);
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!active.menu.contains(event.target)) return;
      event.preventDefault();
      const items = [...active.menu.querySelectorAll('.imsg-ios-select-option:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 1 ? items.length - 1 : index - 1);
      items[next]?.focus();
    }
  }, true);
  window.addEventListener('resize', () => { if (active) close(); });
  document.addEventListener('scroll', event => {
    if (active && !active.menu.contains(event.target)) close();
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) scan(node);
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        const removed = [];
        if (node.matches?.('select')) removed.push(node);
        node.querySelectorAll?.('select').forEach(select => removed.push(select));
        for (const select of removed) {
          const item = enhanced.get(select);
          if (!item || select.isConnected) continue;
          if (active?.select === select) close();
          item.trigger.remove();
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan(document.documentElement);
  return true;
}

installIosSelectFix();
