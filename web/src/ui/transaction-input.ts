import Fraction from 'fraction.js';
import { parseClipboard } from '../engine/clipboard-parser';
import type { ClipboardParseResult, RawTransaction, OperationType } from '../engine/types';
import { exportTransactionsToCsv, parseCsvToTransactions, findDuplicatesInList, findDuplicatesAgainstExisting, isDuplicate } from '../engine/csv-io';
import { showModal } from './modal';

let nextId = 1;

function generateId(): string {
  return `tx-${Date.now()}-${nextId++}`;
}

/**
 * Storage key for persisted transactions.
 */
const STORAGE_KEY = 'fifo-transactions';

/**
 * Load transactions from localStorage.
 */
export function loadTransactions(): RawTransaction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Corrupted data, start fresh
  }
  return [];
}

/**
 * Save transactions to localStorage.
 */
export function saveTransactions(transactions: RawTransaction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ---------------------------------------------------------------
   SVG icon helpers
   --------------------------------------------------------------- */
const ICON_PASTE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M12 11v6M9 14h6"/></svg>`;
const ICON_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`;
const ICON_X     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const ICON_PLUS  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const ICON_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_TRASH_ALL = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_CHEVRON = `<svg class="collapsible-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
const ICON_DOWNLOAD = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICON_UPLOAD = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

/**
 * Return a colored pill badge for an operation type.
 */
function opBadge(op: OperationType): string {
  const cls = op === 'Buy' ? 'badge-buy' : op === 'Sell' ? 'badge-sell' : 'badge-conversion';
  const label = op === 'Buy' ? 'Nabycie' : op === 'Sell' ? 'Odkupienie' : 'Zamiana';
  return `<span class="badge ${cls}">${label}</span>`;
}

/**
 * Show an inline error banner inside a target element.
 * Auto-dismisses after 5 seconds.
 */
function showError(targetEl: HTMLElement, message: string): void {
  // Remove any existing banner first
  const existing = targetEl.querySelector('.error-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.innerHTML = `
    <span>${message}</span>
    <button class="error-banner-close" aria-label="Zamknij">${ICON_X}</button>
  `;

  banner.querySelector('.error-banner-close')!.addEventListener('click', () => banner.remove());
  targetEl.prepend(banner);

  setTimeout(() => {
    if (banner.isConnected) banner.remove();
  }, 5000);
}

/**
 * Create the transaction input UI component.
 */
export function createTransactionInput(
  container: HTMLElement,
  onTransactionsChanged: (transactions: RawTransaction[]) => void,
  transactionsListContainer?: HTMLElement,
): void {
  let transactions = loadTransactions();

  container.innerHTML = `
    <!-- Clipboard paste section -->
    <div class="card" id="paste-card">
      <h2>Wklej z banku</h2>
      <div class="form-group">
        <label for="clipboard-textarea">Tekst transakcji skopiowany z banku</label>
        <textarea id="clipboard-textarea" rows="6"
          placeholder="Wklej tutaj tekst transakcji skopiowany z interfejsu banku..."></textarea>
      </div>
      <div id="paste-error-slot"></div>
      <button id="parse-btn" class="btn btn-primary btn-block">
        ${ICON_PASTE} Parsuj transakcje
      </button>
    </div>

    <!-- Preview panel (animated) -->
    <div class="preview-panel" id="preview-panel" role="region" aria-label="Podglad transakcji">
      <h2>Podglad wykrytej transakcji</h2>
      <div id="preview-form"></div>
      <div id="preview-error-slot"></div>
      <div class="btn-row">
        <button id="confirm-btn" class="btn btn-primary">
          ${ICON_CHECK} Zatwierdz
        </button>
        <button id="cancel-btn" class="btn btn-secondary">
          ${ICON_X} Anuluj
        </button>
      </div>
    </div>

    <!-- Manual entry (collapsible) -->
    <div class="card" id="manual-card">
      <div class="collapsible-header" id="manual-toggle" role="button" tabindex="0"
        aria-expanded="false" aria-controls="manual-body">
        <h2 style="margin-bottom:0">Dodaj recznie</h2>
        ${ICON_CHEVRON}
      </div>
      <div class="collapsible-body" id="manual-body">
        <div id="manual-form-container"></div>
        <div id="manual-error-slot"></div>
      </div>
    </div>

  `;

  // Render transactions list in a separate container (below results) or fallback to main container
  const txListTarget = transactionsListContainer || container;
  txListTarget.innerHTML = `
    <div class="card" id="transactions-card">
      <div class="collapsible-header" id="txlist-toggle" role="button" tabindex="0"
        aria-expanded="false" aria-controls="txlist-body">
        <div class="flex items-center" style="gap:0.5rem">
          <h2 style="margin-bottom:0">Lista transakcji</h2>
          <span class="badge" id="txlist-count" style="font-size:0.7rem"></span>
        </div>
        <div class="flex items-center" style="gap:0.5rem">
          <button id="export-btn" class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.5rem" title="Eksportuj do CSV">
            ${ICON_DOWNLOAD} Eksportuj
          </button>
          <button id="import-btn" class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.5rem" title="Importuj z CSV">
            ${ICON_UPLOAD} Importuj
          </button>
          <input type="file" id="import-file-input" accept=".csv" class="sr-only" />
          <button id="clear-all-btn" class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.5rem">
            ${ICON_TRASH_ALL} Wyczysc
          </button>
          ${ICON_CHEVRON}
        </div>
      </div>
      <div class="collapsible-body" id="txlist-body">
        <div id="transactions-list"></div>
      </div>
    </div>
  `;

  const clipboardTextarea = container.querySelector('#clipboard-textarea') as HTMLTextAreaElement;
  const parseBtn          = container.querySelector('#parse-btn') as HTMLButtonElement;
  const previewPanel      = container.querySelector('#preview-panel') as HTMLDivElement;
  const previewForm       = container.querySelector('#preview-form') as HTMLDivElement;
  const confirmBtn        = container.querySelector('#confirm-btn') as HTMLButtonElement;
  const cancelBtn         = container.querySelector('#cancel-btn') as HTMLButtonElement;
  const transactionsList  = txListTarget.querySelector('#transactions-list') as HTMLDivElement;
  const clearAllBtn       = txListTarget.querySelector('#clear-all-btn') as HTMLButtonElement;
  const exportBtn         = txListTarget.querySelector('#export-btn') as HTMLButtonElement;
  const importBtn         = txListTarget.querySelector('#import-btn') as HTMLButtonElement;
  const importFileInput   = txListTarget.querySelector('#import-file-input') as HTMLInputElement;
  const txListToggle      = txListTarget.querySelector('#txlist-toggle') as HTMLDivElement;
  const txListBody        = txListTarget.querySelector('#txlist-body') as HTMLDivElement;
  const txListCount       = txListTarget.querySelector('#txlist-count') as HTMLSpanElement;
  const manualFormContainer = container.querySelector('#manual-form-container') as HTMLDivElement;
  const manualToggle      = container.querySelector('#manual-toggle') as HTMLDivElement;
  const manualBody        = container.querySelector('#manual-body') as HTMLDivElement;
  const pasteErrorSlot    = container.querySelector('#paste-error-slot') as HTMLDivElement;
  const previewErrorSlot  = container.querySelector('#preview-error-slot') as HTMLDivElement;
  const manualErrorSlot   = container.querySelector('#manual-error-slot') as HTMLDivElement;

  let currentParseResult: ClipboardParseResult | null = null;

  // ----- Collapsible transactions list -----
  function toggleTxList(open?: boolean) {
    const isOpen = open !== undefined ? open : !txListBody.classList.contains('open');
    txListToggle.classList.toggle('open', isOpen);
    txListBody.classList.toggle('open', isOpen);
    txListToggle.setAttribute('aria-expanded', String(isOpen));
  }

  // Prevent action button clicks from toggling the collapsible
  clearAllBtn.addEventListener('click', (e) => e.stopPropagation());
  exportBtn.addEventListener('click', (e) => e.stopPropagation());
  importBtn.addEventListener('click', (e) => e.stopPropagation());

  txListToggle.addEventListener('click', () => toggleTxList());
  txListToggle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTxList(); }
  });

  // ----- Collapsible manual form -----
  function toggleManual(open?: boolean) {
    const isOpen = open !== undefined ? open : !manualBody.classList.contains('open');
    manualToggle.classList.toggle('open', isOpen);
    manualBody.classList.toggle('open', isOpen);
    manualToggle.setAttribute('aria-expanded', String(isOpen));
  }

  manualToggle.addEventListener('click', () => toggleManual());
  manualToggle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleManual(); }
  });

  // ----- Manual form (with deduplication) -----
  renderManualForm(manualFormContainer, manualErrorSlot, (tx) => {
    if (isDuplicate(tx, transactions)) {
      showError(manualErrorSlot, `Transakcja o nr zlecenia ${tx.transactionNumber} z data ${tx.date} juz istnieje.`);
      return;
    }
    transactions.push(tx);
    saveTransactions(transactions);
    renderTransactionsList();
    onTransactionsChanged(transactions);
  });

  // ----- Parse button -----
  parseBtn.addEventListener('click', () => {
    const text = clipboardTextarea.value.trim();
    if (!text) {
      showError(pasteErrorSlot, 'Wklej tekst transakcji przed parsowaniem.');
      return;
    }

    try {
      currentParseResult = parseClipboard(text);
      renderPreview(previewForm, currentParseResult);
      previewPanel.classList.add('open');
      // Scroll preview into view
      previewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      showError(pasteErrorSlot, `Blad parsowania: ${(e as Error).message}`);
    }
  });

  // ----- Confirm (with deduplication) -----
  confirmBtn.addEventListener('click', () => {
    if (!currentParseResult) return;

    const tx = collectPreviewData(previewForm, currentParseResult.operationType, previewErrorSlot);
    if (tx) {
      if (isDuplicate(tx, transactions)) {
        showError(previewErrorSlot, `Transakcja o nr zlecenia ${tx.transactionNumber} z data ${tx.date} juz istnieje.`);
        return;
      }
      transactions.push(tx);
      saveTransactions(transactions);
      renderTransactionsList();
      onTransactionsChanged(transactions);
      previewPanel.classList.remove('open');
      clipboardTextarea.value = '';
      currentParseResult = null;
    }
  });

  // ----- Cancel -----
  cancelBtn.addEventListener('click', () => {
    previewPanel.classList.remove('open');
    currentParseResult = null;
  });

  // ----- Clear all (modal) -----
  clearAllBtn.addEventListener('click', async () => {
    if (transactions.length === 0) return;
    const result = await showModal({
      title: 'Wyczysc wszystkie transakcje',
      body: `Na pewno usunac wszystkie ${transactions.length} transakcji? Tej operacji nie mozna cofnac.`,
      buttons: [
        { label: 'Wyczysc', className: 'btn btn-danger', value: 'clear' },
        { label: 'Anuluj', className: 'btn btn-secondary', value: 'cancel' },
      ],
    });
    if (result === 'clear') {
      transactions = [];
      saveTransactions(transactions);
      renderTransactionsList();
      onTransactionsChanged(transactions);
    }
  });

  // ----- Export CSV -----
  exportBtn.addEventListener('click', () => {
    if (transactions.length === 0) return;
    const csv = exportTransactionsToCsv(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fifo-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ----- Import CSV -----
  importBtn.addEventListener('click', () => {
    importFileInput.value = '';
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseCsvToTransactions(text);

      if (imported.length === 0) {
        showError(txListTarget.querySelector('#transactions-list')! as HTMLElement, 'Plik CSV nie zawiera transakcji.');
        return;
      }

      // Check for duplicates within imported file
      const internalDups = findDuplicatesInList(imported);
      if (internalDups.length > 0) {
        showError(
          txListTarget.querySelector('#transactions-list')! as HTMLElement,
          `Plik zawiera duplikaty (nr zlecenia): ${[...new Set(internalDups)].join(', ')}`,
        );
        return;
      }

      // Ask user what to do
      const action = await showModal({
        title: 'Import transakcji',
        body: `Znaleziono <strong>${imported.length}</strong> transakcji w pliku CSV.${transactions.length > 0 ? ` Masz obecnie <strong>${transactions.length}</strong> transakcji.` : ''}<br>Co chcesz zrobic?`,
        buttons: [
          ...(transactions.length > 0 ? [{ label: 'Zastap istniejace', className: 'btn btn-danger', value: 'replace' }] : []),
          { label: transactions.length > 0 ? 'Dodaj do istniejacych' : 'Importuj', className: 'btn btn-primary', value: 'add' },
          { label: 'Anuluj', className: 'btn btn-secondary', value: 'cancel' },
        ],
      });

      if (action === 'cancel' || action === null) return;

      if (action === 'add') {
        // Check duplicates against existing
        const crossDups = findDuplicatesAgainstExisting(imported, transactions);
        if (crossDups.length > 0) {
          showError(
            txListTarget.querySelector('#transactions-list')! as HTMLElement,
            `Duplikaty z istniejacymi transakcjami (nr zlecenia): ${[...new Set(crossDups)].join(', ')}`,
          );
          return;
        }
        transactions = [...transactions, ...imported];
      } else {
        // Replace
        transactions = imported;
      }

      saveTransactions(transactions);
      renderTransactionsList();
      onTransactionsChanged(transactions);
      toggleTxList(true);
    } catch (e) {
      showError(
        txListTarget.querySelector('#transactions-list')! as HTMLElement,
        `Blad importu: ${(e as Error).message}`,
      );
    }
  });

  // ----- Render transactions list -----
  function renderTransactionsList() {
    txListCount.textContent = transactions.length > 0 ? `${transactions.length}` : '';
    exportBtn.disabled = transactions.length === 0;

    if (transactions.length === 0) {
      transactionsList.innerHTML = `
        <div class="empty-state">Brak transakcji. Wklej dane z banku lub dodaj recznie.</div>
      `;
      return;
    }

    let html = `
      <div class="table-wrapper">
        <table class="data-table" role="grid">
          <thead>
            <tr>
              <th>#</th>
              <th>Data</th>
              <th>Typ</th>
              <th>Fundusz</th>
              <th>Rejestr</th>
              <th class="numeric">Kwota USD</th>
              <th class="numeric">Jednostki</th>
              <th class="numeric">Kurs PLN/USD</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
    `;

    transactions.forEach((tx, idx) => {
      const fundCell = tx.dstFundName
        ? `<span class="fund-name" title="${tx.fundName}">${tx.fundName}</span><span class="fund-arrow">&#8594;</span><span class="fund-name" title="${tx.dstFundName}">${tx.dstFundName}</span>`
        : `<span class="fund-name" title="${tx.fundName}">${tx.fundName}</span>`;

      const regCell = tx.dstRegister
        ? `${tx.register}<span class="fund-arrow">&#8594;</span>${tx.dstRegister}`
        : tx.register;

      const unitsCell = tx.dstUnits
        ? `${tx.units}<span class="fund-arrow">&#8594;</span>${tx.dstUnits}`
        : tx.units;

      html += `
        <tr>
          <td class="text-muted text-mono">${idx + 1}</td>
          <td class="text-secondary">${tx.date}</td>
          <td>${opBadge(tx.operationType)}</td>
          <td>${fundCell}</td>
          <td class="text-secondary text-mono">${regCell}</td>
          <td class="numeric">${tx.amount}</td>
          <td class="numeric">${unitsCell}</td>
          <td class="numeric">${tx.currencyConversionRate || '—'}</td>
          <td>
            <button class="btn-icon delete-tx-btn" data-idx="${idx}" title="Usun transakcje" aria-label="Usun transakcje ${idx + 1}">
              ${ICON_TRASH}
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    transactionsList.innerHTML = html;

    // Attach delete listeners
    transactionsList.querySelectorAll('.delete-tx-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt((btn as HTMLElement).dataset.idx!);
        transactions.splice(i, 1);
        saveTransactions(transactions);
        renderTransactionsList();
        onTransactionsChanged(transactions);
      });
    });
  }

  // Initial render
  renderTransactionsList();
  onTransactionsChanged(transactions);
}

/**
 * Render an editable preview form from parsed clipboard data.
 */
function renderPreview(container: HTMLElement, parsed: ClipboardParseResult): void {
  const isConversion = parsed.operationType === 'Conversion';

  let html = `
    <div class="form-row form-row-3" style="margin-bottom:0.875rem">
      <label>Typ operacji
        <input name="operationType" value="${parsed.operationType}" readonly />
      </label>
      <label>Data
        <input name="date" value="${parsed.date}" />
      </label>
      <label>Nr zlecenia
        <input name="transactionNumber" value="${parsed.transactionNumber}" />
      </label>
    </div>
    <fieldset>
      <legend>${isConversion ? 'Fundusz zrodlowy' : 'Fundusz'}</legend>
      <div class="form-row form-row-2" style="margin-bottom:0.75rem">
        <label>Nazwa funduszu
          <input name="fundName" value="${parsed.fundName}" />
        </label>
        <label>Rejestr
          <input name="register" value="${parsed.register}" />
        </label>
      </div>
      <div class="form-row form-row-3">
        <label>Kwota USD
          <input name="amount" value="${parsed.amount}" />
        </label>
        <label>Jednostki
          <input name="units" value="${parsed.units}" />
        </label>
        <label>Prowizja USD
          <input name="commission" value="${parsed.commission}" />
        </label>
      </div>
      ${isConversion ? '' : `
      <div style="margin-top:0.75rem">
        <label>Kurs PLN/USD${parsed.amountPln ? ' <span class="text-muted text-xs">(wykryto kwota PLN: ' + parsed.amountPln + ')</span>' : ''}
          <input name="currencyConversionRate" value="${computeImpliedRate(parsed)}" placeholder="Wpisz sredni kurs NBP" />
        </label>
      </div>`}
    </fieldset>
  `;

  if (isConversion) {
    html += `
    <fieldset>
      <legend>Fundusz docelowy</legend>
      <div class="form-row form-row-3">
        <label>Nazwa funduszu
          <input name="dstFundName" value="${parsed.dstFundName || ''}" />
        </label>
        <label>Rejestr
          <input name="dstRegister" value="${parsed.dstRegister || ''}" />
        </label>
        <label>Jednostki docelowe
          <input name="dstUnits" value="${parsed.dstUnits || ''}" />
        </label>
      </div>
    </fieldset>
    `;
  }

  container.innerHTML = html;
}

/**
 * Try to compute implied PLN/USD rate from amount and amountPln.
 */
function computeImpliedRate(parsed: ClipboardParseResult): string {
  if (parsed.amountPln && parsed.amount) {
    try {
      const amountUsd = new Fraction(parsed.amount);
      const amountPln = new Fraction(parsed.amountPln);
      if (amountUsd.compare(0) > 0) {
        return amountPln.div(amountUsd).valueOf().toFixed(4);
      }
    } catch {
      // Can't compute, user enters manually
    }
  }
  return '';
}

/**
 * Collect data from the preview form inputs into a RawTransaction.
 */
function collectPreviewData(
  container: HTMLElement,
  operationType: OperationType,
  errorSlot: HTMLElement,
): RawTransaction | null {
  const get = (name: string): string => {
    const input = container.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
    return input?.value.trim() ?? '';
  };

  const rate = get('currencyConversionRate');
  if (!rate && operationType !== 'Conversion') {
    showError(errorSlot, 'Kurs PLN/USD jest wymagany dla operacji nabycia/odkupienia.');
    return null;
  }

  const tx: RawTransaction = {
    id: generateId(),
    date: get('date'),
    operationType,
    fundName: get('fundName'),
    register: get('register'),
    amount: get('amount'),
    units: get('units'),
    commission: get('commission') || '0',
    currencyConversionRate: rate || '0',
    transactionNumber: get('transactionNumber'),
    dstFundName: get('dstFundName') || undefined,
    dstRegister: get('dstRegister') || undefined,
    dstUnits: get('dstUnits') || undefined,
  };

  return tx;
}

/**
 * Render a manual transaction entry form.
 */
function renderManualForm(
  container: HTMLElement,
  errorSlot: HTMLElement,
  onAdd: (tx: RawTransaction) => void,
): void {
  container.innerHTML = `
    <label style="margin-bottom:0.875rem">Typ operacji
      <select name="manual-operationType">
        <option value="Buy">Buy — Nabycie</option>
        <option value="Sell">Sell — Odkupienie</option>
        <option value="Conversion">Conversion — Zamiana</option>
      </select>
    </label>
    <div class="form-row form-row-2">
      <label>Data (DD.MM.YY)
        <input name="manual-date" placeholder="01.01.25" />
      </label>
      <label>Nr zlecenia
        <input name="manual-transactionNumber" placeholder="20250101/WWW/P/001" />
      </label>
    </div>
    <div class="form-row form-row-2" style="margin-top:0.75rem">
      <label>Nazwa funduszu
        <input name="manual-fundName" placeholder="BlackRock GF ..." />
      </label>
      <label>Rejestr
        <input name="manual-register" placeholder="100012345" />
      </label>
    </div>
    <div class="form-row form-row-3" style="margin-top:0.75rem">
      <label>Kwota USD
        <input name="manual-amount" type="text" placeholder="1000.00" />
      </label>
      <label>Jednostki
        <input name="manual-units" type="text" placeholder="10.5" />
      </label>
      <label>Prowizja USD
        <input name="manual-commission" type="text" value="0" />
      </label>
    </div>
    <div id="manual-rate-field" style="margin-top:0.75rem">
      <label>Kurs PLN/USD <span class="text-xs text-muted">(sredni kurs NBP z dnia transakcji)</span>
        <input name="manual-currencyConversionRate" type="text" placeholder="4.1234" />
      </label>
    </div>
    <fieldset id="manual-conversion-fields" style="display:none;margin-top:0.75rem">
      <legend>Fundusz docelowy (tylko zamiana)</legend>
      <div class="form-row form-row-3">
        <label>Nazwa funduszu docelowego
          <input name="manual-dstFundName" />
        </label>
        <label>Rejestr docelowy
          <input name="manual-dstRegister" />
        </label>
        <label>Jednostki docelowe
          <input name="manual-dstUnits" />
        </label>
      </div>
    </fieldset>
    <button id="manual-add-btn" class="btn btn-primary btn-block" style="margin-top:1rem">
      ${ICON_PLUS} Dodaj transakcje
    </button>
  `;

  const opSelect        = container.querySelector('[name="manual-operationType"]') as HTMLSelectElement;
  const conversionFields = container.querySelector('#manual-conversion-fields') as HTMLElement;
  const rateField        = container.querySelector('#manual-rate-field') as HTMLElement;

  opSelect.addEventListener('change', () => {
    const isConversion = opSelect.value === 'Conversion';
    conversionFields.style.display = isConversion ? 'block' : 'none';
    rateField.style.display = isConversion ? 'none' : 'block';
  });

  const addBtn = container.querySelector('#manual-add-btn') as HTMLButtonElement;
  addBtn.addEventListener('click', () => {
    const get = (name: string): string => {
      const input = container.querySelector(`[name="manual-${name}"]`) as HTMLInputElement | null;
      return input?.value.trim() ?? '';
    };

    const opType = get('operationType') as OperationType;
    const rate = get('currencyConversionRate');
    if (!rate && opType !== 'Conversion') {
      showError(errorSlot, 'Kurs PLN/USD jest wymagany dla operacji nabycia/odkupienia.');
      return;
    }

    const tx: RawTransaction = {
      id: generateId(),
      date: get('date'),
      operationType: opType,
      fundName: get('fundName'),
      register: get('register'),
      amount: get('amount'),
      units: get('units'),
      commission: get('commission') || '0',
      currencyConversionRate: rate || '0',
      transactionNumber: get('transactionNumber'),
      dstFundName: opType === 'Conversion' ? get('dstFundName') || undefined : undefined,
      dstRegister: opType === 'Conversion' ? get('dstRegister') || undefined : undefined,
      dstUnits: opType === 'Conversion' ? get('dstUnits') || undefined : undefined,
    };

    onAdd(tx);
  });
}
