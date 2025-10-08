import { describe, it } from 'node:test';
import assert from 'node:assert';
import { transformTransaction, transformTransactions } from '../src/transformer.js';

/**
 * SUPER EASY TEST EXTENSION EXAMPLES:
 *
 * // Add a simple test case:
 * testCase('My test', { amount: '50.00' }, { Amount: 5000 })
 *
 * // Test WealthSimple payee replacement:
 * wsPayeeTest('Dividend')
 *
 * // Test transaction types:
 * typeTest('fee', '5.00', true)  // true = expect negative amount
 *
 * // Test date fallbacks:
 * dateTest('my scenario', { date: '2024-01-01' }, '2024-01-01')
 *
 * // Batch test multiple scenarios:
 * ...['fee', 'charge', 'interest'].map(type => typeTest(type, '10.00', true))
 */

/**
 * Helper functions to make test cases easier to write and read
 */

/**
 * Create a WealthSimple transaction with defaults
 * Only specify the fields you care about, others get sensible defaults
 */
function createWSTransaction(overrides = {}) {
  const defaults = {
    account: 'Test Account',
    status: 'filled',
    date: '2024-01-01',
    amount: '10.00',
    amountCurrency: 'CAD',
    type: 'deposit',
    description: 'Test transaction',
    email: '',
    message: '',
    enteredQuantity: '1',
    filledQuantity: '',
    accountNumber: '12345',
    transactionId: ''
  };
  return { ...defaults, ...overrides };
}

/**
 * Create an expected ActualBudget transaction with defaults
 * Only specify the fields you care about, others get sensible defaults
 */
function createExpected(overrides = {}) {
  const defaults = {
    Date: '2024-01-01',
    Account: 'Test Account',
    Payee: 'Test transaction',
    Amount: 1000,
    Notes: 'deposit Test transaction'
  };
  return { ...defaults, ...overrides };
}

/**
 * Create a test case with minimal syntax
 */
function testCase(name, wsOverrides, expectedOverrides) {
  return {
    name,
    input: createWSTransaction(wsOverrides),
    expected: createExpected(expectedOverrides)
  };
}

/**
 * Convenience functions for common test scenarios
 */

// Quick WealthSimple payee test
function wsPayeeTest(payeeName, amount = '10.00') {
  return testCase(
    `WealthSimple payee: ${payeeName}`,
    { description: payeeName, amount, transactionId: 'ws_001' },
    {
      Payee: 'WealthSimple',
      Amount: parseFloat(amount) * 100,
      Notes: `deposit ${payeeName} [ws_001]`
    }
  );
}

// Quick transaction type test
function typeTest(type, amount = '10.00', expectNegative = false) {
  const expectedAmount = expectNegative
    ? -Math.abs(parseFloat(amount) * 100)
    : parseFloat(amount) * 100;
  return testCase(
    `Transaction type: ${type}`,
    { type, amount, description: `${type} transaction` },
    { Payee: `${type} transaction`, Amount: expectedAmount, Notes: `${type} ${type} transaction` }
  );
}

// Quick date fallback test
function dateTest(name, dateFields, expectedDate) {
  return testCase(
    `Date fallback: ${name}`,
    { ...dateFields, description: 'Date test' },
    { Date: expectedDate, Payee: 'Date test', Notes: 'deposit Date test' }
  );
}

/**
 * Comprehensive transformer tests with parameterized test cases
 */

describe('Transformer Comprehensive Tests', () => {
  /**
   * Test cases - now much more concise!
   * Just specify what's different from the defaults
   */
  const testCases = [
    // Basic functionality
    testCase(
      'Basic deposit with all fields',
      {
        account: 'WealthSimple Cash',
        date: '2024-01-15',
        submitted: '2024-01-15T09:00:00Z',
        filled: '2024-01-15T10:01:00Z',
        amount: '100.50',
        description: 'Salary deposit',
        email: 'user@example.com',
        message: 'Biweekly payroll',
        filledQuantity: '1.0',
        transactionId: 'txn_123'
      },
      {
        Date: '2024-01-15',
        Account: 'WealthSimple Cash',
        Payee: 'Salary deposit',
        Amount: 10050,
        Notes: 'deposit Salary deposit (user@example.com): Biweekly payroll 1.0 [txn_123]'
      }
    ),

    // Amount and type handling
    testCase(
      'Withdrawal with negative amount',
      {
        date: '2024-02-01',
        amount: '-250.00',
        type: 'withdrawal',
        description: 'ATM withdrawal',
        transactionId: 'txn_456'
      },
      {
        Date: '2024-02-01',
        Payee: 'ATM withdrawal',
        Amount: -25000,
        Notes: 'withdrawal ATM withdrawal [txn_456]'
      }
    ),

    testCase(
      'Payment type (debit) with positive amount',
      {
        date: '2024-03-01',
        amount: '50.00',
        type: 'payment',
        description: 'Store payment',
        transactionId: 'txn_789'
      },
      {
        Date: '2024-03-01',
        Payee: 'Store payment',
        Amount: -5000,
        Notes: 'payment Store payment [txn_789]'
      }
    ),

    testCase(
      'Zero amount transaction',
      { date: '2024-12-02', amount: '0.00', type: 'adjustment', description: 'Balance adjustment' },
      {
        Date: '2024-12-02',
        Payee: 'Balance adjustment',
        Amount: 0,
        Notes: 'adjustment Balance adjustment'
      }
    ),

    testCase(
      'Large amount (decimal handling)',
      { date: '2024-12-01', amount: '999.99', description: 'Large deposit' },
      { Date: '2024-12-01', Payee: 'Large deposit', Amount: 99999, Notes: 'deposit Large deposit' }
    ),

    // Date fallback scenarios
    testCase(
      'Date priority (date over filled)',
      {
        date: '2024-04-01',
        submitted: '2024-04-01T08:00:00Z',
        filled: '2024-04-01T12:01:00Z',
        amount: '25.00'
      },
      { Date: '2024-04-01', Amount: 2500 }
    ),

    testCase(
      'Date fallback to submitted',
      {
        date: '',
        filled: '',
        submitted: '2024-05-01T15:30:00Z',
        amount: '75.25',
        type: 'transfer',
        description: 'Transfer payment'
      },
      {
        Date: '2024-05-01',
        Payee: 'Transfer payment',
        Amount: 7525,
        Notes: 'transfer Transfer payment'
      }
    ),

    // WealthSimple payee replacements
    testCase(
      'WealthSimple payee: Referral',
      {
        account: 'WealthSimple Cash',
        date: '2024-06-01',
        description: 'Referral',
        transactionId: 'ref_001'
      },
      {
        Account: 'WealthSimple Cash',
        Date: '2024-06-01',
        Payee: 'WealthSimple',
        Notes: 'deposit Referral [ref_001]'
      }
    ),

    testCase(
      'WealthSimple payee: Interest',
      {
        account: 'WealthSimple Save',
        date: '2024-06-02',
        amount: '5.50',
        description: 'Interest',
        transactionId: 'int_001'
      },
      {
        Account: 'WealthSimple Save',
        Date: '2024-06-02',
        Payee: 'WealthSimple',
        Amount: 550,
        Notes: 'deposit Interest [int_001]'
      }
    ),

    testCase(
      'WealthSimple payee: Bonus',
      { date: '2024-06-03', amount: '15.00', description: 'Bonus', transactionId: 'bon_001' },
      { Date: '2024-06-03', Payee: 'WealthSimple', Amount: 1500, Notes: 'deposit Bonus [bon_001]' }
    ),

    testCase(
      'WealthSimple payee: Cash back',
      { date: '2024-06-04', amount: '3.25', description: 'Cash back', transactionId: 'cb_001' },
      {
        Date: '2024-06-04',
        Payee: 'WealthSimple',
        Amount: 325,
        Notes: 'deposit Cash back [cb_001]'
      }
    ),

    testCase(
      'WealthSimple payee: Reimbursement',
      {
        date: '2024-06-05',
        amount: '15.00',
        description: 'Reimbursement',
        transactionId: 'reimb_001'
      },
      {
        Date: '2024-06-05',
        Payee: 'WealthSimple',
        Amount: 1500,
        Notes: 'deposit Reimbursement [reimb_001]'
      }
    ),

    testCase(
      'No WealthSimple replacement for regular payee',
      {
        date: '2024-06-05',
        amount: '45.00',
        description: 'Regular Company Payment',
        transactionId: 'reg_001'
      },
      {
        Date: '2024-06-05',
        Payee: 'Regular Company Payment',
        Amount: 4500,
        Notes: 'deposit Regular Company Payment [reg_001]'
      }
    ),

    // Notes formatting
    testCase(
      'Notes without colon (no message/quantity)',
      {
        date: '2024-07-01',
        amount: '20.00',
        description: 'Simple deposit',
        email: 'test@example.com',
        transactionId: 'simple_001'
      },
      {
        Date: '2024-07-01',
        Payee: 'Simple deposit',
        Amount: 2000,
        Notes: 'deposit Simple deposit (test@example.com) [simple_001]'
      }
    ),

    testCase(
      'Notes with colon (has message)',
      {
        date: '2024-07-02',
        amount: '30.00',
        description: 'Deposit with message',
        email: 'test@example.com',
        message: 'Monthly payment',
        transactionId: 'msg_001'
      },
      {
        Date: '2024-07-02',
        Payee: 'Deposit with message',
        Amount: 3000,
        Notes: 'deposit Deposit with message (test@example.com): Monthly payment [msg_001]'
      }
    ),

    testCase(
      'Notes with colon (has quantity)',
      {
        date: '2024-07-03',
        amount: '40.00',
        type: 'purchase',
        description: 'Stock purchase',
        email: 'test@example.com',
        filledQuantity: '2.5 shares',
        transactionId: 'qty_001'
      },
      {
        Date: '2024-07-03',
        Payee: 'Stock purchase',
        Amount: -4000,
        Notes: 'purchase Stock purchase (test@example.com): 2.5 shares [qty_001]'
      }
    ),

    testCase(
      'Full filledQuantity string preserved',
      {
        account: 'WealthSimple Invest',
        date: '2024-08-01',
        amount: '1000.00',
        type: 'purchase',
        description: 'ETF Purchase',
        filledQuantity: '15.342 shares of VTI',
        transactionId: 'etf_001'
      },
      {
        Account: 'WealthSimple Invest',
        Date: '2024-08-01',
        Payee: 'ETF Purchase',
        Amount: -100000,
        Notes: 'purchase ETF Purchase: 15.342 shares of VTI [etf_001]'
      }
    ),

    // Edge cases
    testCase(
      'Missing transactionId',
      {
        date: '2024-09-01',
        amount: '50.00',
        description: 'Deposit without ID',
        email: 'test@example.com'
      },
      {
        Date: '2024-09-01',
        Payee: 'Deposit without ID',
        Amount: 5000,
        Notes: 'deposit Deposit without ID (test@example.com)'
      }
    ),

    testCase(
      'Minimal transaction (type fallback)',
      { account: 'Minimal Account', date: '2024-10-01', amount: '1.00', description: '' },
      {
        Account: 'Minimal Account',
        Date: '2024-10-01',
        Payee: 'Deposit',
        Amount: 100,
        Notes: 'deposit'
      }
    ),

    testCase(
      'Complex payee pattern',
      {
        date: '2024-11-01',
        amount: '123.45',
        type: 'payment',
        description: 'ACME Corporation #12345 payment',
        transactionId: 'complex_001'
      },
      {
        Date: '2024-11-01',
        Payee: 'ACME Corporation 12345 payment',
        Amount: -12345,
        Notes: 'payment ACME Corporation #12345 payment [complex_001]'
      }
    ),

    // Using helper functions - super easy to add new tests!
    ...['Referral', 'Interest', 'Bonus', 'Cash back', 'Reimbursement'].map((payee) =>
      wsPayeeTest(payee)
    ),

    typeTest('withdrawal', '50.00', true),
    typeTest('purchase', '100.00', true),
    typeTest('dividend', '25.00', false),

    dateTest('date priority', { date: '2024-01-01', filled: '2024-01-02' }, '2024-01-01'),
    dateTest(
      'filled fallback',
      { date: '', filled: '2024-01-02', submitted: '2024-01-03' },
      '2024-01-02'
    ),
    dateTest('submitted fallback', { date: '', filled: '', submitted: '2024-01-03' }, '2024-01-03')
  ];

  // Run parameterized tests
  testCases.forEach((testData) => {
    it(testData.name, () => {
      const result = transformTransaction(testData.input);

      // Check each expected field
      Object.keys(testData.expected).forEach((field) => {
        assert.strictEqual(
          result[field],
          testData.expected[field],
          `Field '${field}' mismatch. Expected: ${testData.expected[field]}, Got: ${result[field]}`
        );
      });

      // Ensure no extra fields are present
      const allowedFields = ['Date', 'Account', 'Payee', 'Notes', 'Amount'];
      const actualFields = Object.keys(result);
      const extraFields = actualFields.filter((field) => !allowedFields.includes(field));
      assert.strictEqual(
        extraFields.length,
        0,
        `Should only have allowed fields, found extra: ${extraFields.join(', ')}`
      );

      // Ensure all required fields are present
      allowedFields.forEach((field) => {
        assert.ok(
          Object.prototype.hasOwnProperty.call(result, field),
          `Missing required field: ${field}`
        );
      });
    });
  });

  // Test the batch transformation function
  it('should transform multiple transactions correctly', () => {
    const inputs = [
      testCases[0].input, // Basic deposit
      testCases[1].input, // Withdrawal
      testCases[5].input // Referral
    ];

    const expected = [testCases[0].expected, testCases[1].expected, testCases[5].expected];

    const results = transformTransactions(inputs);

    assert.strictEqual(results.length, 3, 'Should transform all transactions');

    results.forEach((result, index) => {
      Object.keys(expected[index]).forEach((field) => {
        assert.strictEqual(
          result[field],
          expected[index][field],
          `Transaction ${index}, field '${field}' mismatch`
        );
      });
    });
  });

  // Test edge cases
  describe('Edge Cases', () => {
    it('should handle missing date fields gracefully', () => {
      const input = {
        account: 'Test Account',
        amount: '10.00',
        type: 'deposit',
        description: 'No date transaction'
      };

      const result = transformTransaction(input);
      assert.strictEqual(result.Date, null, 'Should return null for missing dates');
    });

    it('should handle invalid amount gracefully', () => {
      const input = {
        account: 'Test Account',
        date: '2024-01-01',
        amount: 'invalid',
        type: 'deposit',
        description: 'Invalid amount'
      };

      const result = transformTransaction(input);
      assert.ok(isNaN(result.Amount), 'Should return NaN for invalid amounts');
    });

    it('should handle empty strings in fields', () => {
      const input = {
        account: '',
        date: '2024-01-01',
        amount: '10.00',
        type: '',
        description: '',
        email: '',
        message: '',
        filledQuantity: '',
        transactionId: ''
      };

      const result = transformTransaction(input);
      assert.strictEqual(result.Account, '', 'Should preserve empty account');
      assert.strictEqual(result.Payee, 'Unknown', 'Should handle empty description with fallback');
      assert.strictEqual(result.Notes, '', 'Should handle all empty fields');
    });
  });
});
