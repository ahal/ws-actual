import { describe, it } from 'node:test';
import assert from 'node:assert';
import { transformTransaction, shouldIncludeTransaction } from '../src/transformer.js';

/**
 * Additional edge case tests for transformer
 * Focuses on boundary conditions and error handling
 */

describe('Transformer Edge Cases', () => {
  describe('Investment Transaction Filtering', () => {
    it('should include deposit transactions', () => {
      const transaction = {
        type: 'deposit',
        account: 'Investment Account',
        amount: '1000.00',
        date: '2024-03-15'
      };

      assert.ok(shouldIncludeTransaction(transaction), 'Deposit should be included');
    });

    it('should include withdrawal transactions', () => {
      const transaction = {
        type: 'withdrawal',
        account: 'Investment Account',
        amount: '-500.00',
        date: '2024-03-15'
      };

      assert.ok(shouldIncludeTransaction(transaction), 'Withdrawal should be included');
    });

    it('should include dividend transactions', () => {
      const transaction = {
        type: 'dividend',
        account: 'Investment Account',
        amount: '50.00',
        date: '2024-03-15'
      };

      assert.ok(shouldIncludeTransaction(transaction), 'Dividend should be included');
    });

    it('should include interest transactions', () => {
      const transaction = {
        type: 'interest',
        account: 'Savings Account',
        amount: '10.00',
        date: '2024-03-15'
      };

      assert.ok(shouldIncludeTransaction(transaction), 'Interest should be included');
    });

    it('should exclude buy transactions without cost', () => {
      const transaction = {
        type: 'buy',
        account: 'Investment Account',
        date: '2024-03-15',
        filledQuantity: '10 shares of AAPL'
      };

      assert.ok(!shouldIncludeTransaction(transaction), 'Buy without cost should be excluded');
    });

    it('should exclude sell transactions without proceeds', () => {
      const transaction = {
        type: 'sell',
        account: 'Investment Account',
        date: '2024-03-15',
        filledQuantity: '5 shares of AAPL'
      };

      assert.ok(!shouldIncludeTransaction(transaction), 'Sell without proceeds should be excluded');
    });
  });

  describe('Amount Sign Determination', () => {
    it('should make debit types negative', () => {
      const debitTypes = ['withdrawal', 'payment', 'purchase', 'fee', 'transfer_out'];

      debitTypes.forEach((type) => {
        const transaction = {
          account: 'Test',
          date: '2024-03-15',
          amount: '50.00', // Positive in source data
          type: type,
          description: 'Test'
        };

        const result = transformTransaction(transaction);
        assert.ok(result.Amount < 0, `Type '${type}' should result in negative amount`);
      });
    });

    it('should keep credit types positive', () => {
      const creditTypes = ['deposit', 'transfer_in', 'interest', 'dividend', 'refund'];

      creditTypes.forEach((type) => {
        const transaction = {
          account: 'Test',
          date: '2024-03-15',
          amount: '50.00',
          type: type,
          description: 'Test'
        };

        const result = transformTransaction(transaction);
        assert.ok(result.Amount > 0, `Type '${type}' should result in positive amount`);
      });
    });

    it('should preserve explicit negative sign regardless of type', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '-50.00', // Already negative
        type: 'deposit', // Credit type
        description: 'Test'
      };

      const result = transformTransaction(transaction);
      // Negative should be preserved even for credit type
      assert.ok(result.Amount < 0, 'Explicit negative sign should be preserved');
    });
  });

  describe('Payee Name Generation', () => {
    it('should use description as payee when available', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment',
        description: 'Coffee Shop Purchase'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Payee, 'Coffee Shop Purchase');
    });

    it('should use email as payee when description missing', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'transfer',
        email: 'friend@example.com'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Payee, 'friend@example.com');
    });

    it('should fallback to type when no description or email', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'interest'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Payee, 'interest');
    });

    it('should use "Unknown" as last resort payee', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Payee, 'Unknown');
    });
  });

  describe('Notes Field Formatting', () => {
    it('should combine type, description, and message with proper spacing', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment',
        description: 'Store Purchase',
        message: 'Thank you!'
      };

      const result = transformTransaction(transaction);
      assert.ok(result.Notes.includes('payment'), 'Notes should include type');
      assert.ok(result.Notes.includes('Store Purchase'), 'Notes should include description');
      assert.ok(result.Notes.includes('Thank you!'), 'Notes should include message');
    });

    it('should handle empty fields gracefully without extra spaces', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment',
        description: 'Store Purchase',
        email: '',
        message: ''
      };

      const result = transformTransaction(transaction);
      // Should not have double spaces or trailing spaces
      assert.ok(!result.Notes.includes('  '), 'Notes should not have double spaces');
      assert.ok(!result.Notes.endsWith(' '), 'Notes should not end with space');
    });

    it('should include transaction ID in brackets when available', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment',
        description: 'Store Purchase',
        transactionId: 'TXN123456'
      };

      const result = transformTransaction(transaction);
      assert.ok(result.Notes.includes('[TXN123456]'), 'Notes should include transaction ID in brackets');
    });

    it('should include filled quantity when present', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '50.00',
        type: 'buy',
        description: 'Stock Purchase',
        filledQuantity: '10 shares'
      };

      const result = transformTransaction(transaction);
      assert.ok(result.Notes.includes('10 shares'), 'Notes should include filled quantity');
    });
  });

  describe('Date Field Handling', () => {
    it('should prioritize date over filled and submitted', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        filled: '2024-03-14',
        submitted: '2024-03-13',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Date, '2024-03-15', 'Should use date field first');
    });

    it('should fallback to filled when date is missing', () => {
      const transaction = {
        account: 'Test',
        filled: '2024-03-14',
        submitted: '2024-03-13',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Date, '2024-03-14', 'Should use filled field as fallback');
    });

    it('should fallback to submitted when date and filled are missing', () => {
      const transaction = {
        account: 'Test',
        submitted: '2024-03-13',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Date, '2024-03-13', 'Should use submitted field as last resort');
    });

    it('should return null when all date fields are missing', () => {
      const transaction = {
        account: 'Test',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Date, null, 'Should return null when no dates available');
    });
  });

  describe('Account Field Handling', () => {
    it('should use account field directly', () => {
      const transaction = {
        account: 'Primary Checking',
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Account, 'Primary Checking');
    });

    it('should handle empty account field', () => {
      const transaction = {
        account: '',
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Account, '');
    });

    it('should handle missing account field', () => {
      const transaction = {
        date: '2024-03-15',
        amount: '50.00',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.ok('Account' in result, 'Account field should exist');
    });
  });

  describe('Amount Conversion to Cents', () => {
    it('should convert dollars to cents', () => {
      const amounts = [
        { input: '100.00', expected: 10000 },
        { input: '50.50', expected: 5050 },
        { input: '0.01', expected: 1 },
        { input: '1234.56', expected: 123456 }
      ];

      amounts.forEach(({ input, expected }) => {
        const transaction = {
          account: 'Test',
          date: '2024-03-15',
          amount: input,
          type: 'deposit'
        };

        const result = transformTransaction(transaction);
        assert.strictEqual(result.Amount, expected, `${input} should convert to ${expected} cents`);
      });
    });

    it('should handle negative amounts correctly', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '-75.25',
        type: 'withdrawal'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Amount, -7525);
    });

    it('should round fractional cents', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: '10.555', // Should round
        type: 'deposit'
      };

      const result = transformTransaction(transaction);
      assert.strictEqual(result.Amount, 1056, 'Should round to nearest cent');
    });
  });

  describe('Transfer Detection', () => {
    it('should detect transfer when from and to are present and both mapped', () => {
      const transaction = {
        account: 'Checking',
        from: 'Checking',
        to: 'Savings',
        date: '2024-03-15',
        amount: '100.00',
        type: 'transfer'
      };

      const isAccountMapped = (name) => ['Checking', 'Savings'].includes(name);
      const result = transformTransaction(transaction, { isAccountMapped });

      assert.strictEqual(result._isTransfer, true, 'Should be marked as transfer');
      assert.strictEqual(result._transferToAccount, 'Savings', 'Should identify target account');
    });

    it('should not mark as transfer when only one account is mapped', () => {
      const transaction = {
        account: 'Checking',
        from: 'Checking',
        to: 'External Account',
        date: '2024-03-15',
        amount: '100.00',
        type: 'transfer'
      };

      const isAccountMapped = (name) => name === 'Checking';
      const result = transformTransaction(transaction, { isAccountMapped });

      assert.ok(!result._isTransfer, 'Should not be marked as transfer when target unmapped');
    });

    it('should handle transfer from perspective of destination account', () => {
      const transaction = {
        account: 'Savings', // Transaction is in Savings
        from: 'Checking',
        to: 'Savings',
        date: '2024-03-15',
        amount: '100.00',
        type: 'transfer'
      };

      const isAccountMapped = (name) => ['Checking', 'Savings'].includes(name);
      const result = transformTransaction(transaction, { isAccountMapped });

      assert.strictEqual(result._isTransfer, true, 'Should detect transfer from destination perspective');
    });
  });

  describe('Null and Undefined Handling', () => {
    it('should handle null amount', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        amount: null,
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.ok(isNaN(result.Amount) || result.Amount === 0, 'Null amount should be handled gracefully');
    });

    it('should handle undefined amount', () => {
      const transaction = {
        account: 'Test',
        date: '2024-03-15',
        type: 'payment'
      };

      const result = transformTransaction(transaction);
      assert.ok(result, 'Should handle undefined amount');
    });

    it('should handle empty transaction object', () => {
      const transaction = {};

      const result = transformTransaction(transaction);
      assert.ok(result, 'Should handle empty transaction');
      assert.ok('Date' in result);
      assert.ok('Account' in result);
      assert.ok('Payee' in result);
      assert.ok('Amount' in result);
      assert.ok('Notes' in result);
    });
  });
});
