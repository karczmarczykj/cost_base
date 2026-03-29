import type { RawTransaction, OperationType } from './types';

/* ---------------------------------------------------------------
   Constants
   --------------------------------------------------------------- */

const CSV_BOM = '\uFEFF';
const CSV_SEPARATOR = ';';

const HEADERS = [
  'Data',
  'Typ',
  'Fundusz',
  'Rejestr',
  'Kwota USD',
  'Jednostki',
  'Prowizja',
  'Kurs PLN/USD',
  'Nr zlecenia',
  'Fundusz docelowy',
  'Rejestr docelowy',
  'Jednostki docelowe',
] as const;

/** Map from Polish/English operation names to canonical OperationType. */
const OPERATION_TYPE_MAP: Record<string, OperationType> = {
  'buy':        'Buy',
  'nabycie':    'Buy',
  'sell':       'Sell',
  'odkupienie': 'Sell',
  'conversion': 'Conversion',
  'zamiana':    'Conversion',
};

/** Map from canonical OperationType to Polish export name. */
const OPERATION_TYPE_EXPORT: Record<OperationType, string> = {
  Buy:        'Nabycie',
  Sell:       'Odkupienie',
  Conversion: 'Zamiana',
};

/** Map from header name to RawTransaction field. */
const HEADER_TO_FIELD: Record<string, keyof RawTransaction> = {
  'Data':               'date',
  'Typ':                'operationType',
  'Fundusz':            'fundName',
  'Rejestr':            'register',
  'Kwota USD':          'amount',
  'Jednostki':          'units',
  'Prowizja':           'commission',
  'Kurs PLN/USD':       'currencyConversionRate',
  'Nr zlecenia':        'transactionNumber',
  'Fundusz docelowy':   'dstFundName',
  'Rejestr docelowy':   'dstRegister',
  'Jednostki docelowe': 'dstUnits',
};

/* ---------------------------------------------------------------
   Export
   --------------------------------------------------------------- */

/**
 * Escape a CSV field according to RFC 4180.
 * Wraps in double quotes if the value contains separator, quote, or newline.
 */
function escapeCsvField(value: string, separator: string): string {
  if (value.includes(separator) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Export transactions to a CSV string (UTF-8 with BOM, semicolon-separated).
 */
export function exportTransactionsToCsv(transactions: RawTransaction[]): string {
  const lines: string[] = [];

  // Header
  lines.push(HEADERS.join(CSV_SEPARATOR));

  // Deduplicate on export (defensive — duplicates should not exist)
  const seen = new Set<string>();
  for (const tx of transactions) {
    const key = deduplicationKey(tx);
    if (seen.has(key)) continue;
    seen.add(key);

    const row = [
      tx.date,
      OPERATION_TYPE_EXPORT[tx.operationType],
      tx.fundName,
      tx.register,
      tx.amount,
      tx.units,
      tx.commission,
      tx.currencyConversionRate,
      tx.transactionNumber,
      tx.dstFundName ?? '',
      tx.dstRegister ?? '',
      tx.dstUnits ?? '',
    ].map(f => escapeCsvField(f, CSV_SEPARATOR));

    lines.push(row.join(CSV_SEPARATOR));
  }

  return CSV_BOM + lines.join('\r\n');
}

/* ---------------------------------------------------------------
   Import
   --------------------------------------------------------------- */

/**
 * Parse a CSV field that may be RFC 4180 quoted.
 */
function parseCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === separator) {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Detect separator from the first line of CSV content.
 * Returns ';' if semicolons are found, otherwise ','.
 */
function detectSeparator(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

let importIdCounter = 0;

function generateImportId(): string {
  return `csv-${Date.now()}-${++importIdCounter}`;
}

/**
 * Parse a CSV string into RawTransaction[].
 * Autodetects separator, strips BOM, maps Polish/English column headers.
 * Throws descriptive errors with row numbers.
 */
export function parseCsvToTransactions(csvContent: string): RawTransaction[] {
  // Strip BOM
  let content = csvContent;
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Plik CSV jest pusty lub zawiera tylko naglowki.');
  }

  const separator = detectSeparator(lines[0]);
  const headerFields = parseCsvLine(lines[0], separator).map(h => h.trim());

  // Build column index: header name -> column position
  const columnMap = new Map<keyof RawTransaction, number>();
  for (let i = 0; i < headerFields.length; i++) {
    const field = HEADER_TO_FIELD[headerFields[i]];
    if (field) {
      columnMap.set(field, i);
    }
  }

  // Validate required headers
  const requiredHeaders: (keyof RawTransaction)[] = [
    'date', 'operationType', 'fundName', 'register', 'amount', 'units', 'transactionNumber',
  ];
  const missingHeaders = requiredHeaders.filter(h => !columnMap.has(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Brakujace kolumny w CSV: ${missingHeaders.join(', ')}`);
  }

  const transactions: RawTransaction[] = [];
  const errors: string[] = [];

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const fields = parseCsvLine(lines[rowIdx], separator);
    const rowNum = rowIdx + 1; // 1-based for user display

    const get = (field: keyof RawTransaction): string => {
      const idx = columnMap.get(field);
      if (idx === undefined || idx >= fields.length) return '';
      return fields[idx].trim();
    };

    // Parse operation type
    const rawOp = get('operationType').toLowerCase();
    const operationType = OPERATION_TYPE_MAP[rawOp];
    if (!operationType) {
      errors.push(`Wiersz ${rowNum}: nieznany typ operacji "${get('operationType')}"`);
      continue;
    }

    const date = get('date');
    const fundName = get('fundName');
    const register = get('register');
    const amount = get('amount');
    const units = get('units');
    const transactionNumber = get('transactionNumber');
    const commission = get('commission') || '0';
    const currencyConversionRate = get('currencyConversionRate');

    // Validate required fields
    if (!date) { errors.push(`Wiersz ${rowNum}: brak daty`); continue; }
    if (!fundName) { errors.push(`Wiersz ${rowNum}: brak nazwy funduszu`); continue; }
    if (!register) { errors.push(`Wiersz ${rowNum}: brak rejestru`); continue; }
    if (!amount) { errors.push(`Wiersz ${rowNum}: brak kwoty`); continue; }
    if (!units) { errors.push(`Wiersz ${rowNum}: brak jednostek`); continue; }
    if (!transactionNumber) { errors.push(`Wiersz ${rowNum}: brak nr zlecenia`); continue; }

    // Conversion rate required for Buy/Sell
    if ((operationType === 'Buy' || operationType === 'Sell') && !currencyConversionRate) {
      errors.push(`Wiersz ${rowNum}: brak kursu PLN/USD dla operacji ${operationType}`);
      continue;
    }

    const tx: RawTransaction = {
      id: generateImportId(),
      date,
      operationType,
      fundName,
      register,
      amount,
      units,
      commission,
      currencyConversionRate: currencyConversionRate || '0',
      transactionNumber,
      dstFundName: get('dstFundName') || undefined,
      dstRegister: get('dstRegister') || undefined,
      dstUnits: get('dstUnits') || undefined,
    };

    transactions.push(tx);
  }

  if (errors.length > 0) {
    throw new Error('Bledy importu CSV:\n' + errors.join('\n'));
  }

  return transactions;
}

/* ---------------------------------------------------------------
   Deduplication
   --------------------------------------------------------------- */

/**
 * Build a deduplication key from transaction number + date.
 */
export function deduplicationKey(tx: Pick<RawTransaction, 'transactionNumber' | 'date'>): string {
  return `${tx.transactionNumber}|${tx.date}`;
}

/**
 * Find duplicate transaction keys in a list.
 * Returns array of duplicate transactionNumbers (for error display).
 */
export function findDuplicatesInList(transactions: Pick<RawTransaction, 'transactionNumber' | 'date'>[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const tx of transactions) {
    const key = deduplicationKey(tx);
    if (seen.has(key)) {
      duplicates.push(tx.transactionNumber);
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

/**
 * Find transactions from `incoming` that already exist in `existing`.
 * Returns array of duplicate transactionNumbers.
 */
export function findDuplicatesAgainstExisting(
  incoming: Pick<RawTransaction, 'transactionNumber' | 'date'>[],
  existing: Pick<RawTransaction, 'transactionNumber' | 'date'>[],
): string[] {
  const existingKeys = new Set(existing.map(deduplicationKey));
  const duplicates: string[] = [];

  for (const tx of incoming) {
    if (existingKeys.has(deduplicationKey(tx))) {
      duplicates.push(tx.transactionNumber);
    }
  }

  return duplicates;
}

/**
 * Check if a single transaction is a duplicate of any in the list.
 */
export function isDuplicate(
  tx: Pick<RawTransaction, 'transactionNumber' | 'date'>,
  existing: Pick<RawTransaction, 'transactionNumber' | 'date'>[],
): boolean {
  const key = deduplicationKey(tx);
  return existing.some(e => deduplicationKey(e) === key);
}
