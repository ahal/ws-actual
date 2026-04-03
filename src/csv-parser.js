import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import { finished } from 'stream/promises';

/**
 * Expected CSV columns from WealthSimple export
 */
export const EXPECTED_COLUMNS = [
  'account',
  'status',
  'date',
  'submitted',
  'filled',
  'amount',
  'amountCurrency',
  'type',
  'description',
  'email',
  'message',
  'enteredQuantity',
  'filledQuantity',
  'accountNumber',
  'transactionId'
];

/**
 * Optional CSV columns for transfer handling
 */
export const OPTIONAL_COLUMNS = ['from', 'to'];

/**
 * Parse WealthSimple CSV file
 * @param {string} filePath Path to CSV file
 * @param {Object} options Parser options
 * @returns {Promise<Array>} Parsed transactions
 */
export async function parseCSV(filePath, options = {}) {
  const transactions = [];
  const errors = [];

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: (value, _context) => {
        // Keep original string values for now
        return value;
      },
      on_record: (record, _context) => {
        // Process the record (transactionId is optional)
        return processRecord(record);
      }
    })
  );

  parser.on('data', (record) => {
    if (record) {
      transactions.push(record);
    }
  });

  parser.on('error', (error) => {
    errors.push(error.message);
  });

  await finished(parser);

  if (errors.length > 0 && options.verbose) {
    console.warn('CSV parsing warnings:', errors);
  }

  return transactions;
}

/**
 * Process a single CSV record
 * @param {Object} record Raw CSV record
 * @returns {Object} Processed record
 */
function processRecord(record) {
  return {
    // Core fields
    account: record.account || '',
    status: record.status || '',
    date: parseDate(record.date),
    submitted: parseDate(record.submitted),
    filled: parseDate(record.filled),
    amount: parseAmount(record.amount),
    amountCurrency: record.amountCurrency || 'CAD',
    type: record.type || '',
    description: record.description || '',
    email: record.email || '',
    message: record.message || '',
    enteredQuantity: parseFloat(record.enteredQuantity) || 0,
    filledQuantity: record.filledQuantity || '',
    accountNumber: record.accountNumber || '',
    transactionId: record.transactionId || '',

    // Transfer fields (optional)
    from: record.from || '',
    to: record.to || '',

    // Preserve any additional columns
    ...Object.keys(record).reduce((acc, key) => {
      if (!EXPECTED_COLUMNS.includes(key) && !OPTIONAL_COLUMNS.includes(key)) {
        acc[key] = record[key];
      }
      return acc;
    }, {})
  };
}

/**
 * Parse date string to YYYY-MM-DD format
 * @param {string} dateStr Date string
 * @returns {string|null} Formatted date or null
 */
function parseDate(dateStr) {
  if (!dateStr) {
    return null;
  }

  try {
    // Handle various date formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }

    // Return in YYYY-MM-DD format
    return date.toISOString().split('T')[0];
  } catch (error) {
    return null;
  }
}

/**
 * Parse amount string to number
 * @param {string} amountStr Amount string
 * @returns {number} Amount in dollars
 */
function parseAmount(amountStr) {
  if (!amountStr) {
    return 0;
  }

  // Remove currency symbols and spaces
  const cleaned = amountStr
    .toString()
    .replace(/[$,\s]/g, '')
    .replace(/[()]/g, (match) => (match === '(' ? '-' : ''));

  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

/**
 * Validate CSV file has expected columns
 * @param {string} filePath Path to CSV file
 * @returns {Promise<Object>} Validation result
 */
export async function validateCSV(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    const stream = createReadStream(filePath);
    const parser = stream.pipe(
      parse({
        columns: true,
        to_line: 2 // Read header + first row
      })
    );

    parser.on('data', (record) => {
      records.push(record);
    });

    parser.on('error', (error) => {
      reject(new Error(`CSV validation failed: ${error.message}`));
    });

    parser.on('end', () => {
      if (records.length === 0) {
        reject(new Error('CSV file appears to be empty'));
        return;
      }

      const columns = Object.keys(records[0]);
      const missing = EXPECTED_COLUMNS.filter((col) => !columns.includes(col));
      const isValid = missing.length === 0;

      resolve({
        isValid,
        columns,
        missing,
        message: isValid ? 'CSV format is valid' : `Missing required columns: ${missing.join(', ')}`
      });
    });
  });
}

/**
 * Get unique accounts from transactions
 * @param {Array} transactions Parsed transactions
 * @returns {Array<string>} Unique account names
 */
export function getUniqueAccounts(transactions) {
  const accounts = new Set();
  transactions.forEach((t) => {
    if (t.account) {
      accounts.add(t.account);
    }
  });
  return Array.from(accounts).sort();
}

/**
 * Filter transactions by date range
 * @param {Array} transactions Transactions to filter
 * @param {string} startDate Start date (YYYY-MM-DD)
 * @param {string} endDate End date (YYYY-MM-DD)
 * @returns {Array} Filtered transactions
 */
export function filterByDateRange(transactions, startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  return transactions.filter((t) => {
    const date = new Date(t.date || t.filled || t.submitted);
    if (start && date < start) {
      return false;
    }
    if (end && date > end) {
      return false;
    }
    return true;
  });
}

export default {
  parseCSV,
  validateCSV,
  getUniqueAccounts,
  filterByDateRange,
  EXPECTED_COLUMNS
};
