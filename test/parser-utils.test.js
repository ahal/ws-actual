import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTransaction } from '../src/parser.js';

/**
 * Unit tests for parser utility functions
 * Tests edge cases and error handling in date/currency parsing
 */

describe('Parser Utility Functions', () => {
  describe('Date Parsing Edge Cases', () => {
    it('should handle empty date field', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: '' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.date, null, 'Empty date should be null');
    });

    it('should handle relative date "today"', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'Today' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.date, expectedDate, 'Today should parse to current date');
    });

    it('should handle relative date "yesterday"', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'Yesterday' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expectedDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.date, expectedDate, 'Yesterday should parse to previous day');
    });

    it('should handle standard date format with time', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024 3:45 pm' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.date, '2024-03-15', 'Date with time should parse correctly');
    });

    it('should handle date format without time', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.date, '2024-03-15', 'Date without time should parse correctly');
    });

    it('should handle invalid date format gracefully', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'Invalid Date String' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result even with invalid date');
      assert.strictEqual(result.date, null, 'Invalid date should return null');
    });
  });

  describe('Currency Parsing Edge Cases', () => {
    it('should parse negative amount with minus sign before dollar', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '− $50.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.amount, '-50.00', 'Should parse negative amount correctly');
    });

    it('should parse negative amount with minus sign after dollar', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$-50.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.amount, '-50.00', 'Should parse negative amount correctly');
    });

    it('should parse positive amount with plus sign', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '+ $100.00' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.amount, '100.00', 'Should parse positive amount correctly');
    });

    it('should parse amount with currency code', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$100.00 CAD' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.amount, '100.00', 'Should parse amount correctly');
      assert.strictEqual(result.amountCurrency, 'CAD', 'Should extract currency code');
    });

    it('should parse amount with commas', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$1,234.56' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.amount, '1234.56', 'Should parse amount with commas correctly');
    });

    it('should handle invalid currency value', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: 'Invalid' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.amount, null, 'Invalid amount should be null');
    });
  });

  describe('Field Mapping', () => {
    it('should map all simple string fields', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Status', value: 'Complete' },
          { name: 'Type', value: 'Deposit' },
          { name: 'Email', value: 'test@example.com' },
          { name: 'Message', value: 'Test message' },
          { name: 'Date', value: 'March 15, 2024' }
        ],
        description: 'Test Transaction'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.account, 'Test Account');
      assert.strictEqual(result.status, 'Complete');
      assert.strictEqual(result.type, 'Deposit');
      assert.strictEqual(result.email, 'test@example.com');
      assert.strictEqual(result.message, 'Test message');
    });

    it('should map transfer fields (from/to)', () => {
      const rawTransaction = {
        rows: [
          { name: 'From', value: 'Checking' },
          { name: 'To', value: 'Savings' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Transfer'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.from, 'Checking');
      assert.strictEqual(result.to, 'Savings');
    });

    it('should map quantity fields', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Investment' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Entered Quantity', value: '10 shares' },
          { name: 'Filled Quantity', value: '10 shares' }
        ],
        description: 'Stock Purchase'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.enteredQuantity, '10 shares');
      assert.strictEqual(result.filledQuantity, '10 shares');
    });

    it('should map transaction ID and account number', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Transaction ID', value: 'TXN123456' },
          { name: 'Account Number', value: '**** 1234' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.transactionId, 'TXN123456');
      assert.strictEqual(result.accountNumber, '**** 1234');
    });

    it('should handle exchange rate field', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Exchange Rate', value: '1.35' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.exchangeRate, 1.35);
    });
  });

  describe('Transaction Description', () => {
    it('should include description from transaction object', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Purchase at Store'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.description, 'Purchase at Store');
    });

    it('should handle missing description', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Amount', value: '$100.00' }
        ]
      };

      const result = parseTransaction(rawTransaction);

      assert.ok('description' in result);
    });
  });

  describe('Special Amount Fields', () => {
    it('should parse original amount with currency', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Original Amount', value: '$100.00 USD' },
          { name: 'Amount', value: '$135.00 CAD' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.originalAmount, '100.00');
      assert.strictEqual(result.originalCurrency, 'USD');
    });

    it('should parse total cost as negative', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Investment' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Total Cost', value: '$500.00' }
        ],
        description: 'Stock Purchase'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.amount, '-500.00');
    });

    it('should parse spend rewards', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 2024' },
          { name: 'Spend Rewards Applied', value: '$5.00' },
          { name: 'Amount', value: '$100.00' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.spendRewards, '5.00');
    });
  });

  describe('Null and Empty Handling', () => {
    it('should handle null rows', () => {
      const rawTransaction = {
        rows: null,
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return result even with null rows');
      assert.strictEqual(result.description, 'Test');
    });

    it('should handle empty rows array', () => {
      const rawTransaction = {
        rows: [],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should return result with empty rows');
      assert.strictEqual(result.description, 'Test');
    });

    it('should handle rows with empty values', () => {
      const rawTransaction = {
        rows: [
          { name: 'Account', value: '' },
          { name: 'Date', value: '' },
          { name: 'Amount', value: '' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.ok(result, 'Should handle empty values');
      assert.strictEqual(result.account, '');
      assert.strictEqual(result.date, null);
      assert.strictEqual(result.amount, null);
    });
  });

  describe('Case Insensitivity', () => {
    it('should handle uppercase field names', () => {
      const rawTransaction = {
        rows: [
          { name: 'ACCOUNT', value: 'Test Account' },
          { name: 'DATE', value: 'March 15, 2024' },
          { name: 'AMOUNT', value: '$100.00' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.account, 'Test Account');
      assert.strictEqual(result.date, '2024-03-15');
      assert.strictEqual(result.amount, '100.00');
    });

    it('should handle mixed case field names', () => {
      const rawTransaction = {
        rows: [
          { name: 'AcCoUnT', value: 'Test Account' },
          { name: 'DaTe', value: 'March 15, 2024' },
          { name: 'AmOuNt', value: '$100.00' }
        ],
        description: 'Test'
      };

      const result = parseTransaction(rawTransaction);

      assert.strictEqual(result.account, 'Test Account');
      assert.strictEqual(result.date, '2024-03-15');
      assert.strictEqual(result.amount, '100.00');
    });
  });
});
