import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTransaction } from '../src/parser.js';
import { rawScrapedData } from './fixtures/transactions.js';

/**
 * Integration tests for the parser module
 * Tests parsing of raw scraped data into structured transaction objects
 */

describe('Parser Integration Tests', () => {
  describe('Real-World Transaction Parsing', () => {
    it('should parse a complete transaction with all fields', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'WealthSimple Cash' },
          { name: 'Status', value: 'Completed' },
          { name: 'Date', value: 'January 15, 2024 10:30 am' },
          { name: 'Submitted', value: 'January 15, 2024 10:25 am' },
          { name: 'Filled', value: 'January 15, 2024 10:35 am' },
          { name: 'Amount', value: '+ $100.50' },
          { name: 'Type', value: 'deposit' },
          { name: 'Email', value: 'user@example.com' },
          { name: 'Message', value: 'Salary payment' },
          { name: 'Filled Quantity', value: '1' },
          { name: 'Account Number', value: '12345678' },
          { name: 'Transaction ID', value: 'TXN_ABC123' }
        ],
        description: 'Monthly Salary'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'WealthSimple Cash');
      assert.strictEqual(result.status, 'Completed');
      assert.strictEqual(result.date, '2024-01-15');
      assert.strictEqual(result.submitted, '2024-01-15');
      assert.strictEqual(result.filled, '2024-01-15');
      assert.strictEqual(result.amount, 100.5);
      assert.strictEqual(result.type, 'deposit');
      assert.strictEqual(result.email, 'user@example.com');
      assert.strictEqual(result.message, 'Salary payment');
      assert.strictEqual(result.filledQuantity, '1');
      assert.strictEqual(result.accountNumber, '12345678');
      assert.strictEqual(result.transactionId, 'TXN_ABC123');
      assert.strictEqual(result.description, 'Monthly Salary');
    });

    it('should parse transactions from fixture data', () => {
      const result1 = parseTransaction(rawScrapedData.simple);

      assert.strictEqual(result1.account, 'WealthSimple Cash');
      assert.strictEqual(result1.date, '2024-01-15');
      assert.strictEqual(result1.amount, -50);
      assert.strictEqual(result1.status, 'Completed');
      assert.strictEqual(result1.description, 'Coffee Shop');

      const result2 = parseTransaction(rawScrapedData.withCurrency);

      assert.strictEqual(result2.account, 'Investment Account');
      assert.strictEqual(result2.date, '2024-02-20');
      assert.strictEqual(result2.amount, 100);
      assert.strictEqual(result2.amountCurrency, 'CAD');

      const result3 = parseTransaction(rawScrapedData.transfer);

      assert.strictEqual(result3.from, 'Chequing');
      assert.strictEqual(result3.to, 'Savings');
      assert.strictEqual(result3.amount, -200);
    });
  });

  describe('Currency Parsing Edge Cases', () => {
    it('should handle amounts without currency code', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 1, 2024' },
          { name: 'Amount', value: '$50.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.amount, 50);
      assert.strictEqual(result.amountCurrency, undefined);
    });

    it('should handle negative amounts with various symbols', () => {
      const testCases = [
        { value: '− $50.00', expected: -50 },
        { value: '- $50.00', expected: -50 },
        { value: '$-50.00', expected: -50 }
      ];

      testCases.forEach((testCase) => {
        const rawData = {
          fields: [
            { name: 'Account', value: 'Test' },
            { name: 'Date', value: 'March 1, 2024' },
            { name: 'Amount', value: testCase.value }
          ]
        };

        const result = parseTransaction(rawData);
        assert.strictEqual(result.amount, testCase.expected, `Failed for input: ${testCase.value}`);
      });
    });

    it('should handle amounts with commas', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 1, 2024' },
          { name: 'Amount', value: '$1,234.56' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.amount, 1234.56);
    });

    it('should handle zero amounts', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'March 1, 2024' },
          { name: 'Amount', value: '$0.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.amount, 0);
    });

    it('should handle amounts with different currency codes', () => {
      const currencies = ['CAD', 'USD', 'EUR', 'GBP'];

      currencies.forEach((currency) => {
        const rawData = {
          fields: [
            { name: 'Account', value: 'Test' },
            { name: 'Date', value: 'March 1, 2024' },
            { name: 'Total', value: `$100.00 ${currency}` }
          ]
        };

        const result = parseTransaction(rawData);
        assert.strictEqual(result.amount, 100);
        assert.strictEqual(result.amountCurrency, currency);
      });
    });
  });

  describe('Date Parsing Edge Cases', () => {
    it('should parse dates with time', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'December 25, 2024 11:59 pm' },
          { name: 'Amount', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.date, '2024-12-25');
    });

    it('should parse dates without time', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'July 4, 2024' },
          { name: 'Amount', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.date, '2024-07-04');
    });

    it('should handle multiple date fields', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'January 1, 2024 9:00 am' },
          { name: 'Submitted', value: 'January 1, 2024 8:55 am' },
          { name: 'Filled', value: 'January 1, 2024 9:05 am' },
          { name: 'Amount', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.date, '2024-01-01');
      assert.strictEqual(result.submitted, '2024-01-01');
      assert.strictEqual(result.filled, '2024-01-01');
    });

    it('should handle legacy date format without space before time', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 15, 202410:30 am' },
          { name: 'Amount', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.date, '2024-03-15');
    });
  });

  describe('Transfer Transaction Parsing', () => {
    it('should parse transfer with from and to fields', () => {
      const rawData = {
        fields: [
          { name: 'From', value: 'Checking Account' },
          { name: 'To', value: 'Savings Account' },
          { name: 'Date', value: 'April 1, 2024' },
          { name: 'Amount', value: '− $500.00' }
        ],
        description: 'Monthly savings'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.from, 'Checking Account');
      assert.strictEqual(result.to, 'Savings Account');
      assert.strictEqual(result.amount, -500);
      assert.strictEqual(result.description, 'Monthly savings');
    });

    it('should infer account from negative amount in transfer', () => {
      const rawData = {
        fields: [
          { name: 'From', value: 'Checking' },
          { name: 'To', value: 'Savings' },
          { name: 'Date', value: 'April 1, 2024' },
          { name: 'Amount', value: '− $200.00' }
        ],
        description: 'Transfer'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(
        result.account,
        'Checking',
        'Should infer source account from negative amount'
      );
    });

    it('should infer account from positive amount in transfer', () => {
      const rawData = {
        fields: [
          { name: 'From', value: 'Checking' },
          { name: 'To', value: 'Savings' },
          { name: 'Date', value: 'April 1, 2024' },
          { name: 'Amount', value: '+ $200.00' }
        ],
        description: 'Transfer'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(
        result.account,
        'Savings',
        'Should infer destination account from positive amount'
      );
    });
  });

  describe('Investment Transaction Parsing', () => {
    it('should parse stock purchase with quantities', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Investment Account' },
          { name: 'Date', value: 'May 1, 2024' },
          { name: 'Type', value: 'purchase' },
          { name: 'Total Cost', value: '$1,250.75' },
          { name: 'Entered Quantity', value: '10' },
          { name: 'Filled Quantity', value: '10 shares' }
        ],
        description: 'AAPL Purchase'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'Investment Account');
      assert.strictEqual(result.type, 'purchase');
      assert.strictEqual(result.amount, -1250.75, 'Total Cost should be negative');
      assert.strictEqual(result.enteredQuantity, '10');
      assert.strictEqual(result.filledQuantity, '10 shares');
      assert.strictEqual(result.description, 'AAPL Purchase');
    });

    it('should parse dividend payment', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Investment Account' },
          { name: 'Date', value: 'June 1, 2024' },
          { name: 'Type', value: 'dividend' },
          { name: 'Amount', value: '$25.50' }
        ],
        description: 'Quarterly Dividend'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.type, 'dividend');
      assert.strictEqual(result.amount, 25.5);
    });
  });

  describe('Error Handling', () => {
    it('should return null for null input', () => {
      const result = parseTransaction(null);

      assert.strictEqual(result, null);
    });

    it('should return null for undefined input', () => {
      const result = parseTransaction(undefined);

      assert.strictEqual(result, null);
    });

    it('should return null for data without fields', () => {
      const rawData = {
        description: 'Test'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result, null);
    });

    it('should handle empty fields array', () => {
      const rawData = {
        fields: [],
        description: 'Test'
      };

      const result = parseTransaction(rawData);

      // Should still parse description
      assert.strictEqual(result.description, 'Test');
    });

    it('should handle fields with missing values', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: '' },
          { name: 'Date', value: '' },
          { name: 'Amount', value: '' }
        ],
        description: 'Empty fields test'
      };

      const result = parseTransaction(rawData);

      // Should parse even with empty values
      assert.ok(result);
      assert.strictEqual(result.description, 'Empty fields test');
    });

    it('should handle invalid amount gracefully', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 1, 2024' },
          { name: 'Amount', value: 'invalid amount' }
        ]
      };

      const result = parseTransaction(rawData);

      // Parser should handle invalid amounts by warning and returning null amount
      assert.ok(result);
      assert.strictEqual(result.amount, null);
    });

    it('should handle invalid date gracefully', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'invalid date' },
          { name: 'Amount', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      // Parser should handle invalid dates by warning and returning null
      assert.ok(result);
      assert.strictEqual(result.date, null);
    });
  });

  describe('Field Name Variations', () => {
    it('should handle case-insensitive field names', () => {
      const rawData = {
        fields: [
          { name: 'ACCOUNT', value: 'Test Account' },
          { name: 'DATE', value: 'March 1, 2024' },
          { name: 'AMOUNT', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'Test Account');
      assert.strictEqual(result.date, '2024-03-01');
      assert.strictEqual(result.amount, 10);
    });

    it('should handle alternative amount field names', () => {
      const alternativeNames = ['Total', 'Total Value', 'Estimated Amount'];

      alternativeNames.forEach((fieldName) => {
        const rawData = {
          fields: [
            { name: 'Account', value: 'Test' },
            { name: 'Date', value: 'March 1, 2024' },
            { name: fieldName, value: '$50.00' }
          ]
        };

        const result = parseTransaction(rawData);
        assert.strictEqual(result.amount, 50, `Failed to parse amount from field: ${fieldName}`);
      });
    });

    it('should handle exchange rate and original amount fields', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test' },
          { name: 'Date', value: 'March 1, 2024' },
          { name: 'Amount', value: '$75.00 CAD' },
          { name: 'Original Amount', value: '$50.00 USD' },
          { name: 'Exchange Rate', value: '1.50' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.amount, 75);
      assert.strictEqual(result.amountCurrency, 'CAD');
      assert.strictEqual(result.originalAmount, 50);
      assert.strictEqual(result.originalCurrency, 'USD');
      assert.strictEqual(result.exchangeRate, 1.5);
    });
  });

  describe('Complex Real-World Scenarios', () => {
    it('should parse international transfer with currency conversion', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'USD Account' },
          { name: 'Type', value: 'transfer' },
          { name: 'Date', value: 'August 15, 2024 3:45 pm' },
          { name: 'Amount', value: '$100.00 CAD' },
          { name: 'Original Amount', value: '$75.00 USD' },
          { name: 'Exchange Rate', value: '1.3333' },
          { name: 'Message', value: 'Currency conversion' }
        ],
        description: 'USD to CAD Transfer'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'USD Account');
      assert.strictEqual(result.type, 'transfer');
      assert.strictEqual(result.amount, 100);
      assert.strictEqual(result.amountCurrency, 'CAD');
      assert.strictEqual(result.originalAmount, 75);
      assert.strictEqual(result.originalCurrency, 'USD');
      assert.strictEqual(result.exchangeRate, 1.3333);
      assert.strictEqual(result.message, 'Currency conversion');
    });

    it('should parse stock trade with partial fill', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Trading Account' },
          { name: 'Type', value: 'purchase' },
          { name: 'Status', value: 'Partially Filled' },
          { name: 'Date', value: 'September 1, 2024' },
          { name: 'Total Cost', value: '$750.00' },
          { name: 'Entered Quantity', value: '10 shares' },
          { name: 'Filled Quantity', value: '7.5 shares' },
          { name: 'Transaction ID', value: 'TXN_PARTIAL_001' }
        ],
        description: 'GOOGL Buy Order'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'Trading Account');
      assert.strictEqual(result.type, 'purchase');
      assert.strictEqual(result.status, 'Partially Filled');
      assert.strictEqual(result.amount, -750);
      assert.strictEqual(result.enteredQuantity, '10 shares');
      assert.strictEqual(result.filledQuantity, '7.5 shares');
      assert.strictEqual(result.transactionId, 'TXN_PARTIAL_001');
    });
  });
});
