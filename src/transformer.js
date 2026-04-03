/**
 * Transform WealthSimple transactions to ActualBudget format
 */

/**
 * Check if a transaction should be included in the import
 * Filters out internal investment transactions that don't change the account balance
 * @param {Object} transaction WealthSimple transaction
 * @returns {boolean} True if transaction should be included
 */
export function shouldIncludeTransaction(transaction) {
  // List of transaction types that don't change the overall account balance
  // These are internal investment operations (buying/selling stocks, reinvesting dividends, currency conversions)
  const excludedTypes = [
    'market sell',
    'market buy',
    'fractional buy',
    'dividend reinvested',
    'funds converted'
  ];

  const type = (transaction.type || '').toLowerCase();

  // Exclude if type matches any of the excluded types
  return !excludedTypes.includes(type);
}

/**
 * Transform a single WealthSimple transaction to ActualBudget format
 * @param {Object} wsTransaction WealthSimple transaction
 * @param {Object} options Transform options
 * @param {Function} options.isAccountMapped Function to check if account is mapped
 * @returns {Object} ActualBudget transaction
 */
export function transformTransaction(wsTransaction, options = {}) {
  // Use date if available, otherwise use filled, fallback to submitted
  const rawDate = wsTransaction.date || wsTransaction.filled || wsTransaction.submitted;
  const transactionDate = formatDateToYMD(rawDate);

  // Convert amount to cents (ActualBudget uses cents internally)
  // Handle missing or invalid amounts
  let amountInCents;
  if (
    wsTransaction.amount === '' ||
    wsTransaction.amount === null ||
    wsTransaction.amount === undefined
  ) {
    amountInCents = NaN;
  } else {
    // Round .5 cases away from zero for proper currency handling
    const rawCents = wsTransaction.amount * 100;
    if (rawCents >= 0) {
      amountInCents = Math.round(rawCents);
    } else {
      // For negative numbers, Math.round rounds .5 toward positive infinity
      // We want to round away from zero, so we flip, round, and flip back
      amountInCents = -Math.round(-rawCents);
    }
  }

  // Determine if this is a debit or credit
  const isDebit = isDebitTransaction(wsTransaction);
  const finalAmount = isDebit ? -Math.abs(amountInCents) : Math.abs(amountInCents);

  // Check if this is a transfer transaction
  const transferInfo = detectTransfer(wsTransaction, options.isAccountMapped);

  // Check if transfer info was pre-stored (for moved transactions)
  const actualTransferInfo = wsTransaction._transferInfo || transferInfo;

  // Build notes field per CLAUDE.md specification
  let notes;
  if (actualTransferInfo.isTransfer && wsTransaction.from && wsTransaction.to) {
    // For transfers, use simple arrow format: "from account -> to account"
    notes = `${wsTransaction.from} -> ${wsTransaction.to}`;
  } else {
    notes = buildNotesFromSpec(wsTransaction);
  }

  // Build payee name from description
  const payee = buildPayeeName(wsTransaction);

  // Return only the fields specified in CLAUDE.md
  const transformed = {
    Date: transactionDate,
    Account: wsTransaction.account, // Use original WealthSimple account name
    Payee: payee,
    Notes: notes,
    Amount: finalAmount
  };

  // Add transfer metadata if this is a transfer
  if (actualTransferInfo.isTransfer) {
    transformed._isTransfer = true;
    transformed._transferToAccount = actualTransferInfo.toAccount;
  }

  return transformed;
}

/**
 * Transform multiple WealthSimple transactions
 * @param {Array} wsTransactions WealthSimple transactions
 * @param {Object} options Transform options
 * @returns {Array} ActualBudget transactions
 */
export function transformTransactions(wsTransactions, options = {}) {
  return wsTransactions
    .map((transaction) => transformTransaction(transaction, options))
    .filter((transaction) => {
      // Skip transactions with invalid amounts
      if (!Number.isFinite(transaction.Amount)) {
        console.warn(
          `Skipping transaction with invalid amount (${transaction.Amount}): ${transaction.Payee}`
        );
        return false;
      }
      return true;
    });
}

/**
 * Detect if a transaction is a transfer between accounts
 * @param {Object} wsTransaction WealthSimple transaction
 * @param {Function} isAccountMapped Function to check if account name is mapped
 * @returns {Object} Transfer info {isTransfer: boolean, toAccount: string|null}
 */
function detectTransfer(wsTransaction, isAccountMapped) {
  // Check from/to columns first
  if (wsTransaction.from && wsTransaction.to) {
    // If both from and to are present and both match existing accounts, it's a transfer
    if (
      isAccountMapped &&
      isAccountMapped(wsTransaction.from) &&
      isAccountMapped(wsTransaction.to)
    ) {
      // Determine target account based on transaction perspective
      // If this transaction is from the 'from' account, target is 'to' account
      const targetAccount =
        wsTransaction.account === wsTransaction.from ? wsTransaction.to : wsTransaction.from;

      return {
        isTransfer: true,
        toAccount: targetAccount
      };
    }
  }

  return {
    isTransfer: false,
    toAccount: null
  };
}

/**
 * Determine if a transaction is a debit
 * @param {Object} transaction WealthSimple transaction
 * @returns {boolean} True if debit
 */
function isDebitTransaction(transaction) {
  const debitTypes = [
    'withdrawal',
    'withdraw',
    'payment',
    'purchase',
    'transfer_out',
    'fee',
    'interest_charge'
  ];

  const type = (transaction.type || '').toLowerCase();

  // Check if type indicates a debit
  if (debitTypes.some((debitType) => type.includes(debitType))) {
    return true;
  }

  // Check if amount is already negative
  if (transaction.amount < 0) {
    return true;
  }

  // Default credit types
  const creditTypes = ['deposit', 'transfer_in', 'interest', 'dividend', 'refund'];

  if (creditTypes.some((creditType) => type.includes(creditType))) {
    return false;
  }

  // Default to credit if unknown
  return false;
}

function buildNotesFromSpec(transaction) {
  // Build the main part: subheading and/or type
  let mainPart = '';
  const subheading = transaction.subheading?.trim();
  const type = transaction.type?.trim();

  if (subheading && type && subheading !== type) {
    // Both present and different: "Questrade - Full transfer in-kind"
    mainPart = `${subheading} - ${type}`;
  } else if (subheading) {
    // Only subheading (or subheading same as type)
    mainPart = subheading;
  } else if (type) {
    // Only type
    mainPart = type;
  }

  // Add email in parentheses if present
  if (transaction.email?.trim()) {
    mainPart += ` (${transaction.email.trim()})`;
  }

  // Build suffix with message, quantity, and transaction ID
  const suffixParts = [];
  const hasMessage = !!transaction.message?.trim();
  const hasQuantity = !!transaction.filledQuantity?.trim();

  if (hasMessage) {
    suffixParts.push(transaction.message.trim());
  }
  if (hasQuantity) {
    suffixParts.push(transaction.filledQuantity.trim());
  }
  if (transaction.transactionId?.trim()) {
    suffixParts.push(`[${transaction.transactionId.trim()}]`);
  }

  const suffix = suffixParts.join(' ');

  // Combine main part and suffix
  if (!suffix) {
    return mainPart;
  }
  if (hasMessage || hasQuantity) {
    return `${mainPart}: ${suffix}`;
  }
  return `${mainPart} ${suffix}`;
}

/**
 * Format date to YYYY-MM-DD format
 * @param {string} dateStr Date string in various formats
 * @returns {string} Date in YYYY-MM-DD format
 */
function formatDateToYMD(dateStr) {
  if (!dateStr) {
    return null;
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // Return original if invalid
    }

    // Format as YYYY-MM-DD
    return date.toISOString().split('T')[0];
  } catch (error) {
    return dateStr; // Return original if parsing fails
  }
}

/**
 * Build payee name from transaction data
 * @param {Object} transaction WealthSimple transaction
 * @returns {string} Payee name
 */
function buildPayeeName(transaction) {
  let payeeName;

  // Try to extract payee from description
  if (transaction.description) {
    // Common patterns for payee names
    const patterns = [
      /^(?:transfer (?:to|from)|payment (?:to|from))\s+(.+)$/i,
      /^(.+?)(?:\s+\d{4,}|\s+#\d+|\s+\*{4}\d{4})?$/,
      /^(.+?)(?:\s+on\s+\d{1,2}\/\d{1,2})?$/
    ];

    for (const pattern of patterns) {
      const match = transaction.description.match(pattern);
      if (match && match[1]) {
        payeeName = cleanPayeeName(match[1]);
        break;
      }
    }

    // Use full description if no pattern matches
    if (!payeeName) {
      payeeName = cleanPayeeName(transaction.description);
    }
  } else {
    // Fallback to type-based name
    payeeName = getPayeeByType(transaction.type);
  }

  // Replace specific WealthSimple-related payees
  const wealthSimplePayees = ['Referral', 'Interest', 'Bonus', 'Cash back', 'Reimbursement'];
  if (wealthSimplePayees.includes(payeeName)) {
    return 'WealthSimple';
  }

  return payeeName;
}

/**
 * Clean payee name
 * @param {string} name Raw payee name
 * @returns {string} Cleaned payee name
 */
function cleanPayeeName(name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-&.']/g, '')
    .trim()
    .substring(0, 100); // Limit length
}

/**
 * Get default payee name by transaction type
 * @param {string} type Transaction type
 * @returns {string} Default payee name
 */
function getPayeeByType(type) {
  const typeMap = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    transfer: 'Transfer',
    transfer_in: 'Transfer In',
    transfer_out: 'Transfer Out',
    payment: 'Payment',
    purchase: 'Purchase',
    interest: 'Interest',
    dividend: 'Dividend',
    fee: 'Fee',
    refund: 'Refund'
  };

  const lowerType = (type || '').toLowerCase();

  // Find matching type
  for (const [key, value] of Object.entries(typeMap)) {
    if (lowerType.includes(key)) {
      return value;
    }
  }

  return type || 'Unknown';
}

/**
 * Group transactions by account
 * @param {Array} transactions Transformed transactions
 * @returns {Map} Map of account to transactions
 */
export function groupByAccount(transactions) {
  const grouped = new Map();

  transactions.forEach((transaction) => {
    // Extract account name from the Account field
    const account = transaction.Account || 'Unknown';

    if (!grouped.has(account)) {
      grouped.set(account, []);
    }

    grouped.get(account).push(transaction);
  });

  return grouped;
}

/**
 * Calculate transaction statistics
 * @param {Array} transactions Transactions to analyze
 * @returns {Object} Statistics object
 */
export function calculateStatistics(transactions) {
  const stats = {
    total: transactions.length,
    byType: {},
    byAccount: {},
    totalDebits: 0,
    totalCredits: 0,
    dateRange: {
      start: null,
      end: null
    }
  };

  transactions.forEach((transaction) => {
    // Extract type from Notes field (first word)
    const type = extractTypeFromNotes(transaction.Notes) || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    // Count by account using Account field
    const account = transaction.Account || 'unknown';
    stats.byAccount[account] = (stats.byAccount[account] || 0) + 1;

    // Sum amounts using Amount field
    if (transaction.Amount < 0) {
      stats.totalDebits += Math.abs(transaction.Amount);
    } else {
      stats.totalCredits += transaction.Amount;
    }

    // Track date range using Date field
    const date = transaction.Date;
    if (date) {
      if (!stats.dateRange.start || date < stats.dateRange.start) {
        stats.dateRange.start = date;
      }
      if (!stats.dateRange.end || date > stats.dateRange.end) {
        stats.dateRange.end = date;
      }
    }
  });

  // Convert amounts from cents to dollars for display
  stats.totalDebits = stats.totalDebits / 100;
  stats.totalCredits = stats.totalCredits / 100;
  stats.netAmount = stats.totalCredits - stats.totalDebits;

  return stats;
}

/**
 * Extract transaction type from notes field
 * @param {string} notes Notes field
 * @returns {string|null} Transaction type or null
 */
function extractTypeFromNotes(notes) {
  if (!notes || typeof notes !== 'string') {
    return null;
  }
  // Get the first word which should be the type
  const firstWord = notes.trim().split(' ')[0];
  return firstWord || null;
}

/**
 * Validate transformed transaction
 * @param {Object} transaction Transformed transaction
 * @returns {Object} Validation result
 */
export function validateTransaction(transaction) {
  const errors = [];

  if (!transaction.Date) {
    errors.push('Missing transaction date');
  }

  if (typeof transaction.Amount !== 'number') {
    errors.push('Invalid amount');
  }

  if (!transaction.Account) {
    errors.push('Missing account');
  }

  // Notes field is optional but should be a string if present
  if (transaction.Notes && typeof transaction.Notes !== 'string') {
    errors.push('Notes must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default {
  shouldIncludeTransaction,
  transformTransaction,
  transformTransactions,
  groupByAccount,
  calculateStatistics,
  validateTransaction
};
