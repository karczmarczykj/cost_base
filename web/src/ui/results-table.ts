import Fraction from 'fraction.js';
import { FifoEngine } from '../engine/fifo-engine';
import type { RawTransaction, ParsedTransaction } from '../engine/types';

/**
 * Format a Fraction as a 2-decimal string with Polish locale.
 * Uses tabular-nums monospace formatting in the UI.
 */
function fmt(value: Fraction): string {
  const num = value.valueOf();
  return num.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a Fraction as a 4-decimal string (for units).
 */
function fmt4(value: Fraction): string {
  const num = value.valueOf();
  return num.toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/**
 * Format a Fraction as integer, rounded to full PLN (art. 63 Polish tax law).
 */
function fmtInt(value: Fraction): string {
  const num = value.valueOf();
  return Math.round(num).toLocaleString('pl-PL');
}

/**
 * Extract tax year from a date in DD.MM.YY format.
 */
function extractYear(dateDdMmYy: string): number {
  const parts = dateDdMmYy.split('.');
  return 2000 + parseInt(parts[2], 10);
}

/**
 * Classify gain/loss for CSS: returns 'cell-gain', 'cell-loss', or ''.
 */
function gainClass(value: Fraction): string {
  const cmp = value.compare(0);
  if (cmp > 0) return 'cell-gain';
  if (cmp < 0) return 'cell-loss';
  return '';
}

/**
 * Parse a RawTransaction into a ParsedTransaction with Fraction values.
 */
function parseTransaction(raw: RawTransaction): ParsedTransaction {
  return {
    id: raw.id,
    date: raw.date,
    operationType: raw.operationType,
    fundName: raw.fundName,
    register: raw.register,
    amount: new Fraction(raw.amount),
    units: new Fraction(raw.units),
    commission: new Fraction(raw.commission || '0'),
    currencyConversionRate: new Fraction(raw.currencyConversionRate),
    transactionNumber: raw.transactionNumber,
    dstFundName: raw.dstFundName,
    dstRegister: raw.dstRegister,
    dstUnits: raw.dstUnits ? new Fraction(raw.dstUnits) : undefined,
  };
}

/**
 * Run the FIFO engine on a list of raw transactions and render results.
 */
export function renderResults(container: HTMLElement, rawTransactions: RawTransaction[]): void {
  if (rawTransactions.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="empty-state">Dodaj transakcje, aby zobaczyc wyniki obliczen FIFO.</div>
      </div>
    `;
    return;
  }

  try {
    const engine = new FifoEngine();
    const parsed = rawTransactions.map(parseTransaction);

    for (const tx of parsed) {
      switch (tx.operationType) {
        case 'Buy':
          engine.addPayment(
            tx.fundName, tx.register, tx.amount, tx.commission,
            tx.units, tx.currencyConversionRate, tx.transactionNumber,
          );
          break;

        case 'Sell':
          engine.addWithdrawal(
            tx.fundName, tx.register, tx.amount, tx.commission,
            tx.units, tx.currencyConversionRate, tx.transactionNumber, tx.date,
          );
          break;

        case 'Conversion':
          if (!tx.dstFundName || !tx.dstRegister || !tx.dstUnits) {
            throw new Error(
              `Transakcja zamiany ${tx.transactionNumber} nie zawiera danych funduszu docelowego.`,
            );
          }
          engine.addConversion(
            tx.fundName, tx.register, tx.units,
            tx.dstFundName, tx.dstRegister, tx.dstUnits,
            tx.commission, tx.currencyConversionRate, tx.transactionNumber,
          );
          break;
      }
    }

    const closedTx = engine.closedTransactions;
    const remainingFunds = engine.remainingFunds;

    // ---- Group closed transactions by tax year ----
    const byYear = new Map<number, typeof closedTx>();

    for (const [mapKey, entry] of closedTx) {
      const year = extractYear(entry.key.closeDate);
      let yearMap = byYear.get(year);
      if (!yearMap) {
        yearMap = new Map();
        byYear.set(year, yearMap);
      }
      yearMap.set(mapKey, entry);
    }

    // Sort years descending (newest first)
    const sortedYears = [...byYear.keys()].sort((a, b) => b - a);

    let html = '';

    if (closedTx.size === 0) {
      html += `<div class="card">`;
      html += `<h2>Zamkniete transakcje</h2>`;
      html += `<div class="empty-state">Brak zamknietych transakcji.</div>`;
      html += `</div>`;
    } else {
      for (const year of sortedYears) {
        const yearTx = byYear.get(year)!;

        // Compute year totals
        let yearCostPln    = new Fraction(0);
        let yearPaymentPln = new Fraction(0);

        for (const entry of yearTx.values()) {
          yearCostPln    = yearCostPln.add(entry.value.costPln);
          yearPaymentPln = yearPaymentPln.add(entry.value.paymentPln);
        }

        const yearGainPln    = yearPaymentPln.sub(yearCostPln);
        const yearGainCmp    = yearGainPln.compare(0);
        const yearGainClass  = yearGainCmp > 0 ? 'gain' : yearGainCmp < 0 ? 'loss' : '';

        // Summary cards for this year
        html += `
          <div class="summary-cards">
            <div class="summary-card ${yearGainClass}">
              <div class="card-title">Zysk / Strata ${year}</div>
              <div class="card-value">${yearGainCmp >= 0 ? '+' : ''}${fmt(yearGainPln)} PLN</div>
            </div>
            <div class="summary-card">
              <div class="card-title">Przychod PLN ${year}</div>
              <div class="card-value">${fmt(yearPaymentPln)} PLN</div>
            </div>
            <div class="summary-card">
              <div class="card-title">Koszty PLN ${year}</div>
              <div class="card-value">${fmt(yearCostPln)} PLN</div>
            </div>
          </div>
        `;

        // Closed transactions table for this year
        html += `<div class="card">`;
        html += `<h2>Zamkniete transakcje — rok podatkowy ${year}</h2>`;

        html += `<div class="table-wrapper">`;
        html += `<table class="data-table" role="grid">`;
        html += `<thead><tr>
          <th>Fundusz</th>
          <th>Rejestr</th>
          <th>Transakcja</th>
          <th class="numeric">Koszt USD</th>
          <th class="numeric">Koszt PLN</th>
          <th class="numeric">Przychod USD</th>
          <th class="numeric">Przychod PLN</th>
          <th class="numeric">Jednostki</th>
          <th class="numeric">Zysk / Strata PLN</th>
        </tr></thead><tbody>`;

        for (const entry of yearTx.values()) {
          const v = entry.value;
          const gainPln  = v.paymentPln.sub(v.costPln);
          const cls      = gainClass(gainPln);
          const rowClass = gainPln.compare(0) > 0 ? 'row-gain' : gainPln.compare(0) < 0 ? 'row-loss' : '';

          html += `<tr class="${rowClass}">`;
          html += `<td><span class="fund-name" title="${entry.key.fundName}">${entry.key.fundName}</span></td>`;
          html += `<td class="text-secondary text-mono">${entry.key.register}</td>`;
          html += `<td class="text-secondary text-mono">${entry.key.transaction}</td>`;
          html += `<td class="numeric">${fmt(v.costUsd)}</td>`;
          html += `<td class="numeric">${fmt(v.costPln)}</td>`;
          html += `<td class="numeric">${fmt(v.paymentUsd)}</td>`;
          html += `<td class="numeric">${fmt(v.paymentPln)}</td>`;
          html += `<td class="numeric">${fmt4(v.units)}</td>`;
          html += `<td class="numeric ${cls}">${gainPln.compare(0) >= 0 ? '+' : ''}${fmt(gainPln)}</td>`;
          html += `</tr>`;
        }

        html += `</tbody><tfoot><tr>`;
        html += `<td colspan="4"><strong>RAZEM</strong></td>`;
        html += `<td class="numeric"><strong>${fmt(yearCostPln)}</strong></td>`;
        html += `<td></td>`;
        html += `<td class="numeric"><strong>${fmt(yearPaymentPln)}</strong></td>`;
        html += `<td></td>`;
        html += `<td class="numeric ${gainClass(yearGainPln)}">
                   <strong>${yearGainPln.compare(0) >= 0 ? '+' : ''}${fmt(yearGainPln)}</strong>
                 </td>`;
        html += `</tr></tfoot></table></div>`;

        // Tax card for this year
        const taxBase = Math.round(yearGainPln.valueOf());
        const taxAmount = yearGainCmp > 0 ? Math.round(taxBase * 0.19) : 0;

        html += `<div class="tax-card" style="margin-top:1rem">
          <div class="tax-card-main">
            <span class="tax-card-label">Podatek 19% (${year})</span>
            <span class="tax-card-amount">${taxAmount.toLocaleString('pl-PL')} PLN</span>
          </div>
          <div class="tax-card-sub">
            podstawa: <span>${fmtInt(yearGainPln)} PLN</span>
          </div>
          <div class="tax-card-sub">
            przychod: <span>${fmt(yearPaymentPln)} PLN</span>
            &nbsp;&nbsp;koszty: <span>${fmt(yearCostPln)} PLN</span>
          </div>
          ${yearGainCmp <= 0 ? '<div class="tax-card-sub text-muted">Strata — podatek nie wystepuje</div>' : ''}
        </div>`;

        html += `</div>`; // end .card for this year
      }
    }

    // ---- Remaining funds table ----
    html += `<div class="card">`;
    html += `<h2>Otwarte pozycje</h2>`;

    if (remainingFunds.size === 0) {
      html += `<div class="empty-state">Brak otwartych pozycji.</div>`;
    } else {
      html += `<div class="table-wrapper">`;
      html += `<table class="data-table" role="grid">`;
      html += `<thead><tr>
        <th>Fundusz</th>
        <th>Rejestr</th>
        <th class="numeric">Koszt USD</th>
        <th class="numeric">Koszt PLN</th>
        <th class="numeric">Jednostki</th>
      </tr></thead><tbody>`;

      for (const entry of remainingFunds.values()) {
        html += `<tr>`;
        html += `<td><span class="fund-name" title="${entry.key.fundName}">${entry.key.fundName}</span></td>`;
        html += `<td class="text-secondary text-mono">${entry.key.register}</td>`;
        html += `<td class="numeric">${fmt(entry.value.costUsd)}</td>`;
        html += `<td class="numeric">${fmt(entry.value.costPln)}</td>`;
        html += `<td class="numeric">${fmt4(entry.value.units)}</td>`;
        html += `</tr>`;
      }

      html += `</tbody></table></div>`;
    }

    html += `</div>`; // end .card (remaining)

    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = `
      <div class="card">
        <div class="error-banner" role="alert">
          <span><strong>Blad obliczen:</strong> ${(e as Error).message}</span>
        </div>
      </div>
    `;
  }
}
