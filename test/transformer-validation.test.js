import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  transformTransaction,
  transformTransactions,
  validateTransaction,
  calculateStatistics,
  groupByAccount
} from '../src/transformer.js';
import { validTransactions, edgeCaseTransactions } from './fixtures/transactions.js';

/**
 * Integration tests for transformer validation and edge cases
 * Focus on error handling, validation, and statistics
 */

describe('Transformer Validation and Statistics Tests', () => {
  describe('Transaction Validation', () => {
    it('should validate a complete valid transaction', () => {
      const transaction = transformTransaction(validTransactions.simpleDeposit);
      const validation = validateTransaction(transaction);

      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    it('should detect missing date', () => {
      const wsTransaction = {
        account: 'Test Account',
        date: '',
        amount: '100.00',
        type: 'deposit',
        description: 'Test'
      };

      const transaction = transformTransaction(wsTransaction);
      const validation = validateTransaction(transaction);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some((e) => e.includes('date')));
    });

    it('should detect invalid amount type', () => {
      const transaction = {
        Date: '2024-01-01',
        Account: 'Test',
        Payee: 'Test',
        Notes: 'Test',
        Amount: 'invalid' // Should be number
      };

      const validation = validateTransaction(transaction);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some((e) => e.includes('amount')));
    });

    it('should detect missing account', () => {
      const transaction = {
        Date: '2024-01-01',
        Account: '',
        Payee: 'Test',
        Notes: 'Test',
        Amount: 100
      };

      const validation = validateTransaction(transaction);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some((e) => e.includes('account')));
    });

    it('should allow optional notes field', () => {
      const transaction = {
        Date: '2024-01-01',
        Account: 'Test',
        Payee: 'Test',
        Notes: '',
        Amount: 100
      };

      const validation = validateTransaction(transaction);

      assert.strictEqual(validation.isValid, true);
    });

    it('should detect invalid notes type', () => {
      const transaction = {
        Date: '2024-01-01',
        Account: 'Test',
        Payee: 'Test',
        Notes: 123, // Should be string
        Amount: 100
      };

      const validation = validateTransaction(transaction);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some((e) => e.includes('Notes')));
    });
  });

  describe('Edge Case Transformations', () => {
    it('should handle transaction with missing amount', () => {
      const result = transformTransaction(edgeCaseTransactions.missingAmount);

      assert.ok(result);
      assert.ok(isNaN(result.Amount), 'Amount should be NaN for missing amount');
    });

    it('should handle transaction with missing date', () => {
      const result = transformTransaction(edgeCaseTransactions.missingDate);

      assert.ok(result);
      assert.strictEqual(result.Date, null);
    });

    it('should handle transaction with invalid amount', () => {
      const wsTransaction = {
        account: 'Test',
        date: '2024-01-01',
        amount: 'not-a-number',
        type: 'deposit',
        description: 'Invalid'
      };

      const result = transformTransaction(wsTransaction);

      assert.ok(result);
      assert.ok(isNaN(result.Amount));
    });

    it('should handle zero amount transaction', () => {
      const result = transformTransaction(edgeCaseTransactions.zeroAmount);

      assert.strictEqual(result.Amount, 0);
      assert.ok(result.Payee);
      assert.ok(result.Notes);
    });

    it('should handle transaction with empty description', () => {
      const result = transformTransaction(edgeCaseTransactions.emptyDescription);

      assert.ok(result);
      // Should have a default payee
      assert.ok(result.Payee);
      assert.strictEqual(result.Payee, 'Unknown' || 'Deposit');
    });

    it('should handle very large amounts', () => {
      const result = transformTransaction(edgeCaseTransactions.veryLargeAmount);

      assert.strictEqual(result.Amount, 99999999999);
      assert.ok(result.Date);
      assert.ok(result.Account);
    });

    it('should handle special characters in description', () => {
      const result = transformTransaction(edgeCaseTransactions.specialCharacters);

      assert.ok(result);
      assert.ok(result.Payee);
      assert.ok(result.Notes.includes('Special'));
    });

    it('should handle transaction with all empty fields', () => {
      const wsTransaction = {
        account: '',
        date: '',
        amount: '',
        type: '',
        description: '',
        email: '',
        message: '',
        transactionId: ''
      };

      const result = transformTransaction(wsTransaction);

      assert.ok(result);
      // Should still have structure even if empty/invalid
      assert.ok('Date' in result);
      assert.ok('Account' in result);
      assert.ok('Payee' in result);
      assert.ok('Amount' in result);
      assert.ok('Notes' in result);
    });
  });

  describe('Batch Transformation', () => {
    it('should transform multiple valid transactions', () => {
      const wsTransactions = [
        validTransactions.simpleDeposit,
        validTransactions.withdrawal,
        validTransactions.payment
      ];

      const results = transformTransactions(wsTransactions);

      assert.strictEqual(results.length, 3);
      results.forEach((result) => {
        assert.ok(result.Date);
        assert.ok(result.Account);
        assert.ok(typeof result.Amount === 'number');
      });
    });

    it('should transform empty array', () => {
      const results = transformTransactions([]);

      assert.strictEqual(results.length, 0);
      assert.ok(Array.isArray(results));
    });

    it('should handle mix of valid and invalid transactions', () => {
      const wsTransactions = [
        validTransactions.simpleDeposit,
        edgeCaseTransactions.missingAmount,
        validTransactions.withdrawal,
        edgeCaseTransactions.missingDate
      ];

      const results = transformTransactions(wsTransactions);

      assert.strictEqual(results.length, 4);
      // All should transform (some may have null/NaN values)
      results.forEach((result) => {
        assert.ok(result);
        assert.ok('Date' in result);
        assert.ok('Amount' in result);
      });
    });
  });

  describe('Transaction Grouping', () => {
    it('should group transactions by account', () => {
      const transactions = [
        transformTransaction({
          ...validTransactions.simpleDeposit,
          account: 'Account A'
        }),
        transformTransaction({
          ...validTransactions.withdrawal,
          account: 'Account B'
        }),
        transformTransaction({
          ...validTransactions.payment,
          account: 'Account A'
        })
      ];

      const grouped = groupByAccount(transactions);

      assert.strictEqual(grouped.size, 2);
      assert.strictEqual(grouped.get('Account A').length, 2);
      assert.strictEqual(grouped.get('Account B').length, 1);
    });

    it('should handle single account', () => {
      const transactions = [
        transformTransaction(validTransactions.simpleDeposit),
        transformTransaction(validTransactions.withdrawal)
      ];

      const grouped = groupByAccount(transactions);

      assert.strictEqual(grouped.size, 1);
      assert.ok(grouped.has('WealthSimple Cash'));
      assert.strictEqual(grouped.get('WealthSimple Cash').length, 2);
    });

    it('should handle empty transactions array', () => {
      const grouped = groupByAccount([]);

      assert.strictEqual(grouped.size, 0);
    });

    it('should handle transactions with missing account', () => {
      const transactions = [
        {
          Date: '2024-01-01',
          Account: '',
          Payee: 'Test',
          Notes: 'Test',
          Amount: 100
        }
      ];

      const grouped = groupByAccount(transactions);

      assert.strictEqual(grouped.size, 1);
      assert.ok(grouped.has('') || grouped.has('Unknown'));
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate statistics for multiple transactions', () => {
      const wsTransactions = [
        { ...validTransactions.simpleDeposit, amount: '100.00' },
        { ...validTransactions.withdrawal, amount: '-50.00' },
        { ...validTransactions.payment, amount: '25.00', type: 'payment' }
      ];

      const transactions = transformTransactions(wsTransactions);
      const stats = calculateStatistics(transactions);

      assert.strictEqual(stats.total, 3);
      assert.ok(stats.totalCredits > 0);
      assert.ok(stats.totalDebits > 0);
      assert.ok(stats.netAmount !== undefined);
    });

    it('should calculate date range correctly', () => {
      const wsTransactions = [
        { ...validTransactions.simpleDeposit, date: '2024-01-01' },
        { ...validTransactions.withdrawal, date: '2024-01-15' },
        { ...validTransactions.payment, date: '2024-01-31' }
      ];

      const transactions = transformTransactions(wsTransactions);
      const stats = calculateStatistics(transactions);

      assert.strictEqual(stats.dateRange.start, '2024-01-01');
      assert.strictEqual(stats.dateRange.end, '2024-01-31');
    });

    it('should group by transaction type', () => {
      const wsTransactions = [
        { ...validTransactions.simpleDeposit, type: 'deposit' },
        { ...validTransactions.simpleDeposit, type: 'deposit' },
        { ...validTransactions.withdrawal, type: 'withdrawal' },
        { ...validTransactions.payment, type: 'payment' }
      ];

      const transactions = transformTransactions(wsTransactions);
      const stats = calculateStatistics(transactions);

      assert.ok(stats.byType);
      assert.strictEqual(stats.byType.deposit, 2);
      assert.strictEqual(stats.byType.withdrawal, 1);
      assert.strictEqual(stats.byType.payment, 1);
    });

    it('should group by account', () => {
      const wsTransactions = [
        { ...validTransactions.simpleDeposit, account: 'Account A' },
        { ...validTransactions.withdrawal, account: 'Account A' },
        { ...validTransactions.payment, account: 'Account B' }
      ];

      const transactions = transformTransactions(wsTransactions);
      const stats = calculateStatistics(transactions);

      assert.ok(stats.byAccount);
      assert.strictEqual(stats.byAccount['Account A'], 2);
      assert.strictEqual(stats.byAccount['Account B'], 1);
    });

    it('should calculate net amount correctly', () => {
      const wsTransactions = [
        { ...validTransactions.simpleDeposit, amount: '100.00', type: 'deposit' },
        { ...validTransactions.withdrawal, amount: '-50.00', type: 'withdrawal' },
        { ...validTransactions.payment, amount: '25.00', type: 'payment' }
      ];

      const transactions = transformTransactions(wsTransactions);
      const stats = calculateStatistics(transactions);

      // 100 credit, 50 + 25 = 75 debit, net = 25
      assert.strictEqual(stats.netAmount, 25);
    });

    it('should handle empty transactions', () => {
      const stats = calculateStatistics([]);

      assert.strictEqual(stats.total, 0);
      assert.strictEqual(stats.totalCredits, 0);
      assert.strictEqual(stats.totalDebits, 0);
      assert.strictEqual(stats.netAmount, 0);
      assert.strictEqual(stats.dateRange.start, null);
      assert.strictEqual(stats.dateRange.end, null);
    });

    it('should convert amounts from cents to dollars', () => {
      const transactions = [
        {
          Date: '2024-01-01',
          Account: 'Test',
          Payee: 'Test',
          Notes: 'deposit test',
          Amount: 10000 // 100 dollars in cents
        }
      ];

      const stats = calculateStatistics(transactions);

      assert.strictEqual(stats.totalCredits, 100);
    });
  });

  describe('Transfer Validation', () => {
    it('should preserve transfer metadata', () => {
      const wsTransaction = {
        ...validTransactions.transferBetweenAccounts
      };

      const isAccountMapped = (accountName) => {
        return ['Checking Account', 'Savings Account'].includes(accountName);
      };

      const result = transformTransaction(wsTransaction, { isAccountMapped });

      // Transfer metadata should exist
      assert.strictEqual(result._isTransfer, true);
      assert.strictEqual(result._transferToAccount, 'Savings Account');

      // Underscore prefix indicates these are internal metadata
      assert.ok(result.hasOwnProperty('_isTransfer'));
      assert.ok(result.hasOwnProperty('_transferToAccount'));
    });

    it('should validate transfers have required fields', () => {
      const wsTransaction = {
        ...validTransactions.transferBetweenAccounts
      };

      const isAccountMapped = (accountName) => {
        return ['Checking Account', 'Savings Account'].includes(accountName);
      };

      const result = transformTransaction(wsTransaction, { isAccountMapped });
      const validation = validateTransaction(result);

      assert.strictEqual(validation.isValid, true);
    });
  });

  describe('Amount Conversion Edge Cases', () => {
    it('should handle fractional cents correctly', () => {
      const wsTransaction = {
        account: 'Test',
        date: '2024-01-01',
        amount: '10.555', // Should round to nearest cent
        type: 'deposit',
        description: 'Fractional cents'
      };

      const result = transformTransaction(wsTransaction);

      // Should round to 1056 cents (Math.round behavior)
      assert.strictEqual(result.Amount, 1056);
    });

    it('should handle negative fractional amounts', () => {
      const wsTransaction = {
        account: 'Test',
        date: '2024-01-01',
        amount: '-10.555',
        type: 'withdrawal',
        description: 'Negative fractional'
      };

      const result = transformTransaction(wsTransaction);

      assert.strictEqual(result.Amount, -1056);
    });

    it('should handle very small amounts', () => {
      const wsTransaction = {
        account: 'Test',
        date: '2024-01-01',
        amount: '0.01',
        type: 'deposit',
        description: 'One cent'
      };

      const result = transformTransaction(wsTransaction);

      assert.strictEqual(result.Amount, 1);
    });
  });

  describe('Type Detection Edge Cases', () => {
    it('should correctly classify debit transaction types', () => {
      const debitTypes = ['withdrawal', 'payment', 'purchase', 'fee', 'transfer_out'];

      debitTypes.forEach((type) => {
        const wsTransaction = {
          account: 'Test',
          date: '2024-01-01',
          amount: '50.00', // Positive amount
          type: type,
          description: `Test ${type}`
        };

        const result = transformTransaction(wsTransaction);

        assert.ok(
          result.Amount < 0,
          `Type '${type}' should result in negative amount, got ${result.Amount}`
        );
      });
    });

    it('should correctly classify credit transaction types', () => {
      const creditTypes = ['deposit', 'transfer_in', 'interest', 'dividend', 'refund'];

      creditTypes.forEach((type) => {
        const wsTransaction = {
          account: 'Test',
          date: '2024-01-01',
          amount: '50.00',
          type: type,
          description: `Test ${type}`
        };

        const result = transformTransaction(wsTransaction);

        assert.ok(
          result.Amount > 0,
          `Type '${type}' should result in positive amount, got ${result.Amount}`
        );
      });
    });

    it('should respect existing negative sign over type', () => {
      const wsTransaction = {
        account: 'Test',
        date: '2024-01-01',
        amount: '-50.00', // Already negative
        type: 'deposit', // Credit type
        description: 'Test'
      };

      const result = transformTransaction(wsTransaction);

      // Negative amount should be preserved
      assert.ok(result.Amount < 0);
    });
  });
});
