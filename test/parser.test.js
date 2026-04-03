import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTransaction } from '../src/parser.js';

describe('Parser', () => {
  describe('parseTransaction', () => {
    it('should parse a simple transaction', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'WealthSimple Cash' },
          { name: 'Date', value: 'January 15, 2024 10:30 am' },
          { name: 'Amount', value: '− $50.00' },
          { name: 'Status', value: 'Completed' }
        ],
        description: 'Coffee Shop'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'WealthSimple Cash');
      assert.strictEqual(result.date, '2024-01-15');
      assert.strictEqual(result.amount, -50);
      assert.strictEqual(result.status, 'Completed');
      assert.strictEqual(result.description, 'Coffee Shop');
    });

    it('should parse a transaction with currency code', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Investment Account' },
          { name: 'Date', value: 'February 20, 2024' },
          { name: 'Total', value: '+ $100.00 CAD' }
        ],
        description: 'Deposit'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'Investment Account');
      assert.strictEqual(result.date, '2024-02-20');
      assert.strictEqual(result.amount, 100);
      assert.strictEqual(result.amountCurrency, 'CAD');
    });

    it('should handle transfer transactions', () => {
      const rawData = {
        fields: [
          { name: 'From', value: 'Chequing' },
          { name: 'To', value: 'Savings' },
          { name: 'Date', value: 'March 10, 2024 2:00 pm' },
          { name: 'Amount', value: '− $200.00' }
        ],
        description: 'Transfer to Savings'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.from, 'Chequing');
      assert.strictEqual(result.to, 'Savings');
      assert.strictEqual(result.account, 'Chequing'); // Inferred from negative amount
      assert.strictEqual(result.amount, -200);
    });

    it('should return null for empty data', () => {
      const result = parseTransaction(null);
      assert.strictEqual(result, null);
    });

    it('should return null for data without fields', () => {
      const rawData = { description: 'Test' };
      const result = parseTransaction(rawData);
      assert.strictEqual(result, null);
    });

    it('should parse dates without time', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'April 5, 2024' },
          { name: 'Amount', value: '$10.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.date, '2024-04-05');
    });

    it('should handle multiple date fields', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Date', value: 'May 1, 2024 9:00 am' },
          { name: 'Submitted', value: 'May 1, 2024 8:55 am' },
          { name: 'Filled', value: 'May 1, 2024 9:05 am' },
          { name: 'Amount', value: '$25.00' }
        ]
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.date, '2024-05-01');
      assert.strictEqual(result.submitted, '2024-05-01');
      assert.strictEqual(result.filled, '2024-05-01');
    });

    it('should parse all common field types', () => {
      const rawData = {
        fields: [
          { name: 'Account', value: 'Test Account' },
          { name: 'Status', value: 'Completed' },
          { name: 'Type', value: 'Purchase' },
          { name: 'Email', value: 'test@example.com' },
          { name: 'Message', value: 'Test message' },
          { name: 'Transaction ID', value: 'TXN123456' },
          { name: 'Date', value: 'June 15, 2024' },
          { name: 'Amount', value: '− $75.50' }
        ],
        description: 'Online Purchase'
      };

      const result = parseTransaction(rawData);

      assert.strictEqual(result.account, 'Test Account');
      assert.strictEqual(result.status, 'Completed');
      assert.strictEqual(result.type, 'Purchase');
      assert.strictEqual(result.email, 'test@example.com');
      assert.strictEqual(result.message, 'Test message');
      assert.strictEqual(result.transactionId, 'TXN123456');
      assert.strictEqual(result.amount, -75.5);
      assert.strictEqual(result.description, 'Online Purchase');
    });
  });
});
