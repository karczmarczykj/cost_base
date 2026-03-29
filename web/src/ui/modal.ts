/**
 * Lightweight modal dialog — no dependencies, pure DOM.
 * Consistent with the dark-theme design system.
 */

export interface ModalButton {
  label: string;
  /** CSS class(es) for the button, e.g. 'btn btn-primary' */
  className?: string;
  /** Value returned when this button is clicked */
  value: string;
}

export interface ModalOptions {
  title: string;
  body: string;
  buttons: ModalButton[];
  /** If true, clicking the overlay or pressing Escape returns null (default: true) */
  dismissible?: boolean;
}

/**
 * Show a modal dialog and return a Promise that resolves with the
 * clicked button's `value`, or `null` if dismissed.
 */
export function showModal(options: ModalOptions): Promise<string | null> {
  const { title, body, buttons, dismissible = true } = options;

  return new Promise<string | null>((resolve) => {
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // Box
    const box = document.createElement('div');
    box.className = 'modal-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);

    // Title
    const titleEl = document.createElement('h3');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;
    box.appendChild(titleEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    bodyEl.innerHTML = body;
    box.appendChild(bodyEl);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.className = 'modal-buttons';
    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = btn.className ?? 'btn btn-secondary';
      el.textContent = btn.label;
      el.addEventListener('click', () => close(btn.value));
      btnRow.appendChild(el);
    }
    box.appendChild(btnRow);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Focus first button
    const firstBtn = btnRow.querySelector('button') as HTMLButtonElement | null;
    firstBtn?.focus();

    function close(value: string | null) {
      overlay.classList.add('modal-closing');
      overlay.addEventListener('animationend', () => {
        overlay.remove();
        resolve(value);
      }, { once: true });
      // Fallback in case animation doesn't fire
      setTimeout(() => {
        if (overlay.isConnected) {
          overlay.remove();
          resolve(value);
        }
      }, 300);
    }

    // Dismiss on overlay click
    if (dismissible) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });
    }

    // Dismiss on Escape
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) {
        document.removeEventListener('keydown', onKey);
        close(null);
      }
    }
    document.addEventListener('keydown', onKey);
  });
}
