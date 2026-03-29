import './style.css';
import { createTransactionInput } from './ui/transaction-input';
import { renderResults } from './ui/results-table';
import type { RawTransaction } from './engine/types';

function main(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <header class="app-header">
      <h1>FIFO Cost Base</h1>
      <span class="badge badge-local">dane lokalne</span>
    </header>
    <main class="app-main">
      <div class="layout">
        <div class="panel-left" id="input-container"></div>
        <div class="panel-right">
          <div id="results-container"></div>
          <div id="transactions-list-container" style="margin-top:0.75rem"></div>
        </div>
      </div>
    </main>
    <footer class="app-footer">
      <small>Obliczenia wykonywane lokalnie w przegladarce. Dane zapisywane w localStorage.</small>
    </footer>
  `;

  const inputContainer = document.getElementById('input-container')!;
  const resultsContainer = document.getElementById('results-container')!;
  const txListContainer = document.getElementById('transactions-list-container')!;

  createTransactionInput(inputContainer, (transactions: RawTransaction[]) => {
    renderResults(resultsContainer, transactions);
  }, txListContainer);
}

document.addEventListener('DOMContentLoaded', main);
