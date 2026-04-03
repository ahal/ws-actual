import Table from 'cli-table3';

/**
 * Get terminal width (hardcoded for now)
 * @returns {number} Terminal width in characters
 */
function getTerminalWidth() {
  return 200;
}

/**
 * Calculate optimal column widths based on content and terminal width
 * @param {Array} transactions Transactions to analyze
 * @returns {Array<number>} Column widths array
 */
function calculateColumnWidths(transactions) {
  const terminalWidth = getTerminalWidth();
  const headers = ['Date', 'Account', 'Payee', 'Amount', 'Notes'];
  // Calculate the maximum content width for each column
  const maxWidths = [
    Math.max(headers[0].length, ...transactions.map((t) => (t.Date || 'N/A').length)),
    Math.max(headers[1].length, ...transactions.map((t) => (t.Account || 'N/A').length)),
    Math.max(headers[2].length, ...transactions.map((t) => (t.Payee || '').length)),
    Math.max(
      headers[3].length,
      ...transactions.map((t) => {
        const amount = (t.Amount / 100).toFixed(2);
        const formatted = t.Amount >= 0 ? `$${amount}` : `-$${Math.abs(amount)}`;
        return formatted.length;
      })
    ),
    Math.max(headers[4].length, ...transactions.map((t) => (t.Notes || '').length))
  ];

  // Account for table borders and padding (each column has 2 spaces padding + 1 border)
  // Total border overhead: 6 borders + 10 padding (2 per column * 5 columns)
  const tableOverhead = 16;
  const availableWidth = terminalWidth - tableOverhead;

  // Set minimum widths for each column (no maximums to allow full use of space)
  const minWidths = [12, 15, 15, 12, 25]; // Minimum usable widths

  // Ensure each column gets at least its minimum width
  const workingWidths = maxWidths.map((width, i) => Math.max(width, minWidths[i]));

  // Calculate total width needed
  const totalWidth = workingWidths.reduce((sum, width) => sum + width, 0);

  // If we have extra space, distribute it proportionally, favoring Notes but giving good space to Account and Payee
  if (totalWidth < availableWidth) {
    const extraSpace = availableWidth - totalWidth;
    // Give 40% to Notes, 25% to Account, 25% to Payee, 10% distributed among Date/Amount
    const notesExtra = Math.floor(extraSpace * 0.4);
    const accountExtra = Math.floor(extraSpace * 0.25);
    const payeeExtra = Math.floor(extraSpace * 0.25);
    const otherExtra = extraSpace - notesExtra - accountExtra - payeeExtra;

    // Distribute remaining space between Date and Amount
    const perOtherColumnExtra = Math.floor(otherExtra / 2);
    workingWidths[0] += perOtherColumnExtra; // Date
    workingWidths[1] += accountExtra; // Account gets good allocation
    workingWidths[2] += payeeExtra; // Payee gets good allocation
    workingWidths[3] += perOtherColumnExtra; // Amount
    workingWidths[4] += notesExtra + (otherExtra % 2); // Notes gets remainder too
  }

  // If we're over the available width, trim Notes first
  if (totalWidth > availableWidth) {
    const overflow = totalWidth - availableWidth;
    workingWidths[4] = Math.max(minWidths[4], workingWidths[4] - overflow);
  }

  return workingWidths;
}

/**
 * Format transactions for table display
 * @param {Array} transactions Transformed transactions
 * @param {Object} options Formatting options
 * @returns {string} Formatted table string
 */
export function formatTransactionsTable(transactions) {
  if (transactions.length === 0) {
    return 'No transactions to display';
  }

  // Calculate dynamic column widths
  const colWidths = calculateColumnWidths(transactions);

  const table = new Table({
    head: ['Date', 'Account', 'Payee', 'Amount', 'Notes'],
    colWidths: colWidths,
    style: {
      head: ['cyan', 'bold'],
      border: ['grey']
    },
    wordWrap: true
  });

  transactions.forEach((transaction) => {
    const amount = (transaction.Amount / 100).toFixed(2);
    const amountFormatted = transaction.Amount >= 0 ? `$${amount}` : `-$${Math.abs(amount)}`;

    table.push([
      transaction.Date || 'N/A',
      truncateString(transaction.Account || 'N/A', colWidths[1] - 2),
      truncateString(transaction.Payee || '', colWidths[2] - 2),
      amountFormatted,
      truncateString(transaction.Notes || '', colWidths[4] - 2)
    ]);
  });

  return table.toString();
}

/**
 * Format account summary table
 * @param {Map} groupedTransactions Transactions grouped by account
 * @returns {string} Formatted summary table
 */
export function formatAccountSummary(groupedTransactions) {
  const summaryTable = new Table({
    head: ['Account', 'Transactions', 'Total Credits', 'Total Debits', 'Net Amount'],
    colWidths: [25, 15, 15, 15, 15],
    style: {
      head: ['cyan', 'bold'],
      border: ['grey']
    }
  });

  for (const [account, transactions] of groupedTransactions) {
    let totalCredits = 0;
    let totalDebits = 0;

    transactions.forEach((t) => {
      if (t.Amount >= 0) {
        totalCredits += t.Amount;
      } else {
        totalDebits += Math.abs(t.Amount);
      }
    });

    const netAmount = totalCredits - totalDebits;

    summaryTable.push([
      truncateString(account, 23),
      transactions.length.toString(),
      `$${(totalCredits / 100).toFixed(2)}`,
      `$${(totalDebits / 100).toFixed(2)}`,
      `${netAmount >= 0 ? '' : '-'}$${Math.abs(netAmount / 100).toFixed(2)}`
    ]);
  }

  return summaryTable.toString();
}

/**
 * Format validation errors table
 * @param {Array} errors Validation errors
 * @returns {string} Formatted errors table
 */
export function formatValidationErrors(errors) {
  if (errors.length === 0) {
    return '';
  }

  const table = new Table({
    head: ['Transaction ID', 'Error'],
    colWidths: [20, 60],
    style: {
      head: ['red', 'bold'],
      border: ['grey']
    },
    wordWrap: true
  });

  errors.forEach((error) => {
    table.push([truncateString(error.transactionId || 'Unknown', 18), error.message]);
  });

  return table.toString();
}

/**
 * Truncate string to specified length
 * @param {string} str String to truncate
 * @param {number} maxLength Maximum length
 * @returns {string} Truncated string
 */
function truncateString(str, maxLength) {
  if (!str) {
    return '';
  }
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.substring(0, maxLength - 3)}...`;
}

/**
 * Format import statistics
 * @param {Object} stats Statistics object
 * @returns {string} Formatted statistics
 */
export function formatStatistics(stats) {
  const table = new Table({
    head: ['Metric', 'Value'],
    colWidths: [25, 20],
    style: {
      head: ['green', 'bold'],
      border: ['grey']
    }
  });

  table.push(
    ['Total Transactions', stats.total.toString()],
    ['Date Range', `${stats.dateRange.start || 'N/A'} to ${stats.dateRange.end || 'N/A'}`],
    ['Total Credits', `$${stats.totalCredits.toFixed(2)}`],
    ['Total Debits', `$${stats.totalDebits.toFixed(2)}`],
    ['Net Amount', `${stats.netAmount >= 0 ? '' : '-'}$${Math.abs(stats.netAmount).toFixed(2)}`]
  );

  return table.toString();
}

export default {
  formatTransactionsTable,
  formatAccountSummary,
  formatValidationErrors,
  formatStatistics
};
