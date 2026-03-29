import type { ClipboardParseResult, OperationType } from './types';

/**
 * Parse a Polish-formatted number string into a plain decimal string.
 * Examples:
 *   "12 350,63" -> "12350.63"
 *   "-7 853,81" -> "-7853.81"
 *   "0,00"      -> "0.00"
 */
export function parsePolishNumber(input: string): string {
  const trimmed = input.trim();
  // Remove thousands separators (spaces), replace decimal comma with dot
  return trimmed.replace(/\s/g, '').replace(',', '.');
}

/**
 * Extract a numeric value from a string that may contain currency suffix.
 * Examples:
 *   "12 350,63 USD" -> "12350.63"
 *   "-7 853,81 USD" -> "-7853.81"
 *   "(37 800,00 PLN)" -> "37800.00"
 */
function extractNumber(text: string): string {
  // Remove parentheses and currency suffixes
  const cleaned = text.replace(/[()]/g, '').replace(/\s*(USD|PLN)\s*$/i, '').trim();
  return parsePolishNumber(cleaned);
}

/**
 * Check if a line looks like a date in DD.MM.YY format.
 */
function isDate(line: string): boolean {
  return /^\d{2}\.\d{2}\.\d{2}$/.test(line.trim());
}

/**
 * Check if a line looks like a time in HH:MM:SS format.
 */
function isTime(line: string): boolean {
  return /^\d{2}:\d{2}:\d{2}$/.test(line.trim());
}

/**
 * Check if a line looks like a fund name.
 * Fund names end with a parenthesized currency code or fund family, e.g.:
 *   "BlackRock GF China A2 (USD)"
 *   "Allianz DłużnychPapierówKorporacyjnych (Allianz DUO FIO)"
 */
function isFundName(line: string): boolean {
  const t = line.trim();
  if (t === '') return false;
  // Ends with (CURRENCY_CODE) like (USD), (PLN), (EUR)
  if (/\([A-Z]{3}\)\s*$/.test(t)) return true;
  // Ends with parenthesized fund family containing FIO/SFIO/SICAV
  if (/\(.*\b(FIO|SFIO|SICAV)\b.*\)\s*$/.test(t)) return true;
  return false;
}

/**
 * Check if a line is a fund category description (second line after fund name).
 */
function isFundCategory(line: string): boolean {
  return line.trim().startsWith('Fundusz ');
}

/**
 * Check if a line is an amount with USD currency.
 */
function isUsdAmount(line: string): boolean {
  return /^-?[\d\s]+,\d{2}\s+USD$/.test(line.trim());
}

/**
 * Check if a line is a PLN amount in parentheses.
 */
function isPlnAmount(line: string): boolean {
  return /^\([\d\s]+,\d{2}\s+PLN\)$/.test(line.trim());
}

/**
 * Detect operation type from the clipboard text structure.
 *
 * - Buy: positive amount, single fund section
 * - Sell: negative amount, single fund section
 * - Conversion: two fund sections (source negative, destination positive)
 */
function detectOperationType(lines: string[]): OperationType {
  // Count BlackRock fund occurrences
  const fundLines = lines.filter(l => isFundName(l));
  if (fundLines.length >= 2) {
    return 'Conversion';
  }

  // Find the first USD amount
  const amountLine = lines.find(l => isUsdAmount(l));
  if (amountLine && amountLine.trim().startsWith('-')) {
    return 'Sell';
  }

  return 'Buy';
}

/**
 * Parse a single fund section from clipboard lines.
 * Returns parsed fields and the number of lines consumed.
 */
interface FundSection {
  fundName: string;
  amount: string;       // absolute value
  amountPln?: string;   // absolute value, if present
  units: string;
  price: string;
  commission: string;
  register: string;
  transactionNumber: string;
  date: string;
  isNegative: boolean;
}

function parseFundSection(lines: string[], startIdx: number, hasDateHeader: boolean): { section: FundSection; endIdx: number } {
  let i = startIdx;
  let date = '';

  // Optional date + time header
  if (hasDateHeader && i < lines.length && isDate(lines[i])) {
    date = lines[i].trim();
    i++;
    if (i < lines.length && isTime(lines[i])) {
      i++;
    }
  }

  // Scan forward to find the fund name line (skip blanks, whitespace, unknown lines)
  while (i < lines.length && !isFundName(lines[i])) {
    i++;
  }

  // Fund name
  if (i >= lines.length) {
    throw new Error('Nie znaleziono nazwy funduszu w podanym tekście');
  }
  const fundName = lines[i].trim();
  i++;

  // Fund category (skip)
  if (i < lines.length && isFundCategory(lines[i])) {
    i++;
  }

  // Status line "Zrealizowane" (skip)
  if (i < lines.length && lines[i].trim() === 'Zrealizowane') {
    i++;
  }

  // Amount in USD
  let amount = '0';
  let isNegative = false;
  let amountPln: string | undefined;

  if (i < lines.length && isUsdAmount(lines[i])) {
    const raw = extractNumber(lines[i]);
    isNegative = raw.startsWith('-');
    amount = isNegative ? raw.substring(1) : raw;
    i++;

    // Optional PLN amount in parentheses
    if (i < lines.length && isPlnAmount(lines[i])) {
      amountPln = extractNumber(lines[i]);
      i++;
    }
  }

  // Balance line (USD amount without label, skip)
  if (i < lines.length && isUsdAmount(lines[i])) {
    i++;
  }

  // Parse remaining key-value fields
  let units = '0';
  let price = '0';
  let commission = '0';
  let register = '';
  let transactionNumber = '';

  while (i < lines.length) {
    const line = lines[i].trim();

    // Stop if we hit another BlackRock fund (conversion destination)
    if (isFundName(line)) break;
    // Stop if we hit a date (another transaction)
    if (isDate(line)) break;
    // Stop on blank/whitespace line followed by fund name
    if (line.replace(/[\s\u00A0\u200B]+/g, '') === '' && i + 1 < lines.length && isFundName(lines[i + 1])) {
      i++;
      break;
    }

    if (line === 'Data realizacji') {
      i++;
      // Next line is the actual date (skip it, we use order date)
      if (i < lines.length) i++;
      continue;
    }

    if (line === 'Liczba jednostek') {
      i++;
      if (i < lines.length) {
        units = parsePolishNumber(lines[i].trim());
        i++;
      }
      continue;
    }

    if (line === 'Cena') {
      i++;
      if (i < lines.length) {
        price = parsePolishNumber(lines[i].trim());
        i++;
      }
      continue;
    }

    if (line === 'Prowizja' || line.startsWith('Prowizja')) {
      i++;
      if (i < lines.length) {
        commission = extractNumber(lines[i]);
        i++;
      }
      continue;
    }

    if (line === 'Nr rejestru') {
      i++;
      if (i < lines.length) {
        register = lines[i].trim();
        i++;
      }
      continue;
    }

    if (line === 'Numer zlecenia') {
      i++;
      if (i < lines.length) {
        transactionNumber = lines[i].trim();
        i++;
      }
      continue;
    }

    // Skip other lines (tax info, bank account, etc.)
    i++;
  }

  return {
    section: {
      fundName,
      amount,
      amountPln,
      units,
      price,
      commission,
      register,
      transactionNumber,
      date,
      isNegative,
    },
    endIdx: i,
  };
}

/**
 * Parse clipboard text from the bank's web interface.
 * Supports Buy, Sell, and Conversion transactions for BlackRock funds.
 *
 * @param clipboardText - Raw text pasted from the bank's transaction view
 * @returns Parsed result ready for user confirmation/editing
 * @throws Error if the text doesn't contain a recognizable BlackRock transaction
 */
export function parseClipboard(clipboardText: string): ClipboardParseResult {
  const lines = clipboardText.split('\n');

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length < 5) {
    throw new Error('Clipboard text is too short to contain a valid transaction');
  }

  const operationType = detectOperationType(lines);

  if (operationType === 'Conversion') {
    return parseConversion(lines);
  }

  const { section } = parseFundSection(lines, 0, true);

  return {
    operationType,
    date: section.date,
    fundName: section.fundName,
    register: section.register,
    amount: section.amount,
    units: section.units,
    price: section.price,
    commission: section.commission,
    transactionNumber: section.transactionNumber,
    amountPln: section.amountPln,
  };
}

function parseConversion(lines: string[]): ClipboardParseResult {
  // First section: source (negative amount)
  const { section: srcSection, endIdx } = parseFundSection(lines, 0, true);

  // Second section: destination (positive amount)
  const { section: dstSection } = parseFundSection(lines, endIdx, false);

  return {
    operationType: 'Conversion',
    date: srcSection.date,
    fundName: srcSection.fundName,
    register: srcSection.register,
    amount: srcSection.amount,
    units: srcSection.units,
    price: srcSection.price,
    commission: srcSection.commission,
    transactionNumber: srcSection.transactionNumber,
    dstFundName: dstSection.fundName,
    dstRegister: dstSection.register,
    dstUnits: dstSection.units,
    dstPrice: dstSection.price,
  };
}
