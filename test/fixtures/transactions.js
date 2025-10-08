/**
 * Test fixtures for WealthSimple transactions
 * Used across multiple test files
 */

/**
 * Create a base WealthSimple transaction with defaults
 * @param {Object} overrides - Fields to override
 * @returns {Object} WealthSimple transaction
 */
export function createWSTransaction(overrides = {}) {
  const defaults = {
    account: 'WealthSimple Cash',
    status: 'filled',
    date: '2024-01-01',
    submitted: '',
    filled: '',
    amount: '100.00',
    amountCurrency: 'CAD',
    type: 'deposit',
    description: 'Test Transaction',
    email: '',
    message: '',
    enteredQuantity: '',
    filledQuantity: '',
    accountNumber: '12345',
    transactionId: 'txn_test_001',
    from: '',
    to: ''
  };

  return { ...defaults, ...overrides };
}

/**
 * Sample valid transactions
 */
export const validTransactions = {
  simpleDeposit: createWSTransaction({
    amount: '100.50',
    description: 'Salary Deposit',
    type: 'deposit',
    transactionId: 'txn_salary_001'
  }),

  withdrawal: createWSTransaction({
    amount: '-50.00',
    description: 'ATM Withdrawal',
    type: 'withdrawal',
    transactionId: 'txn_atm_001'
  }),

  payment: createWSTransaction({
    amount: '25.00',
    description: 'Coffee Shop',
    type: 'payment',
    transactionId: 'txn_coffee_001'
  }),

  transferBetweenAccounts: createWSTransaction({
    account: 'Checking Account',
    amount: '-500.00',
    description: 'Transfer to Savings',
    type: 'transfer',
    from: 'Checking Account',
    to: 'Savings Account',
    transactionId: 'txn_transfer_001'
  }),

  investmentPurchase: createWSTransaction({
    account: 'Investment Account',
    amount: '-1000.00',
    description: 'Stock Purchase',
    type: 'purchase',
    filledQuantity: '10.5 shares',
    transactionId: 'txn_stock_001'
  }),

  wealthSimpleInterest: createWSTransaction({
    amount: '5.50',
    description: 'Interest',
    type: 'deposit',
    transactionId: 'txn_interest_001'
  })
};

/**
 * Edge case transactions for testing error handling
 */
export const edgeCaseTransactions = {
  missingAmount: createWSTransaction({
    amount: '',
    description: 'Missing Amount'
  }),

  missingDate: createWSTransaction({
    date: '',
    submitted: '',
    filled: '',
    description: 'Missing Date'
  }),

  invalidAmount: createWSTransaction({
    amount: 'invalid',
    description: 'Invalid Amount'
  }),

  zeroAmount: createWSTransaction({
    amount: '0.00',
    description: 'Zero Amount Transaction'
  }),

  emptyDescription: createWSTransaction({
    description: '',
    type: ''
  }),

  veryLargeAmount: createWSTransaction({
    amount: '999999999.99',
    description: 'Very Large Amount'
  }),

  specialCharacters: createWSTransaction({
    description: 'Test #12345 * Special & Chars',
    message: 'Emoji test 🎉'
  })
};

/**
 * Mock ActualBudget accounts
 */
export const mockActualAccounts = [
  {
    id: 'acc_checking_001',
    name: 'Checking Account',
    closed: false,
    offbudget: false
  },
  {
    id: 'acc_savings_001',
    name: 'Savings Account',
    closed: false,
    offbudget: false
  },
  {
    id: 'acc_credit_001',
    name: 'Credit Card',
    closed: false,
    offbudget: false
  },
  {
    id: 'acc_investment_001',
    name: 'Investment Account',
    closed: false,
    offbudget: true
  },
  {
    id: 'acc_closed_001',
    name: 'Old Closed Account',
    closed: true,
    offbudget: false
  }
];

/**
 * Mock ActualBudget payees
 */
export const mockActualPayees = [
  {
    id: 'payee_001',
    name: 'Grocery Store'
  },
  {
    id: 'payee_002',
    name: 'Coffee Shop'
  },
  {
    id: 'payee_transfer_checking',
    name: 'Transfer : Checking Account',
    transfer_acct: 'acc_checking_001'
  },
  {
    id: 'payee_transfer_savings',
    name: 'Transfer : Savings Account',
    transfer_acct: 'acc_savings_001'
  }
];

/**
 * Sample configuration objects
 */
export const mockConfigs = {
  simple: {
    accounts: [
      {
        wsAccountName: 'WealthSimple Cash',
        actualAccountId: 'acc_checking_001'
      }
    ]
  },

  multipleAccounts: {
    accounts: [
      {
        wsAccountName: 'WealthSimple Cash',
        actualAccountId: 'acc_checking_001'
      },
      {
        wsAccountName: 'Savings Account',
        actualAccountId: 'acc_savings_001'
      },
      {
        wsAccountName: 'Investment Account',
        actualAccountId: 'acc_investment_001'
      }
    ]
  },

  empty: {
    accounts: []
  }
};

/**
 * Raw scraped transaction data (before parsing)
 */
export const rawScrapedData = {
  simple: {
    fields: [
      { name: 'Account', value: 'WealthSimple Cash' },
      { name: 'Date', value: 'January 15, 2024 10:30 am' },
      { name: 'Amount', value: '− $50.00' },
      { name: 'Status', value: 'Completed' }
    ],
    description: 'Coffee Shop'
  },

  withCurrency: {
    fields: [
      { name: 'Account', value: 'Investment Account' },
      { name: 'Date', value: 'February 20, 2024' },
      { name: 'Total', value: '+ $100.00 CAD' }
    ],
    description: 'Deposit'
  },

  transfer: {
    fields: [
      { name: 'From', value: 'Chequing' },
      { name: 'To', value: 'Savings' },
      { name: 'Date', value: 'March 10, 2024 2:00 pm' },
      { name: 'Amount', value: '− $200.00' }
    ],
    description: 'Transfer to Savings'
  }
};
