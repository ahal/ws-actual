import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldIncludeTransaction } from '../src/transformer.js';

/**
 * Tests for filtering investment transactions that don't change account balance
 */

describe('Investment Transaction Filter Tests', () => {
  it('should exclude "Market sell" transactions', () => {
    const transaction = {
      account: 'TFSA',
      type: 'Market sell',
      amount: '100.00',
      description: 'Sold stocks'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      false,
      'Market sell transactions should be filtered out'
    );
  });

  it('should exclude "Market buy" transactions', () => {
    const transaction = {
      account: 'RRSP',
      type: 'Market buy',
      amount: '200.00',
      description: 'Bought stocks'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      false,
      'Market buy transactions should be filtered out'
    );
  });

  it('should exclude "Fractional buy" transactions', () => {
    const transaction = {
      account: 'TFSA',
      type: 'Fractional buy',
      amount: '50.00',
      description: 'Fractional stock purchase'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      false,
      'Fractional buy transactions should be filtered out'
    );
  });

  it('should exclude "Dividend reinvested" transactions', () => {
    const transaction = {
      account: 'RRSP',
      type: 'Dividend reinvested',
      amount: '25.00',
      description: 'Reinvested dividend'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      false,
      'Dividend reinvested transactions should be filtered out'
    );
  });

  it('should be case-insensitive when filtering', () => {
    const testCases = [
      'MARKET SELL',
      'market sell',
      'Market Sell',
      'MaRkEt SeLl',
      'MARKET BUY',
      'market buy',
      'FRACTIONAL BUY',
      'fractional buy',
      'DIVIDEND REINVESTED',
      'dividend reinvested'
    ];

    testCases.forEach((type) => {
      const transaction = { type, account: 'TFSA', amount: '100.00' };
      assert.strictEqual(
        shouldIncludeTransaction(transaction),
        false,
        `Should filter out "${type}" regardless of case`
      );
    });
  });

  it('should include deposit transactions', () => {
    const transaction = {
      account: 'TFSA',
      type: 'Deposit',
      amount: '1000.00',
      description: 'Contribution'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Deposit transactions should be included'
    );
  });

  it('should include withdrawal transactions', () => {
    const transaction = {
      account: 'RRSP',
      type: 'Withdrawal',
      amount: '500.00',
      description: 'Withdrawal'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Withdrawal transactions should be included'
    );
  });

  it('should include dividend payment transactions', () => {
    const transaction = {
      account: 'TFSA',
      type: 'Dividend',
      amount: '25.00',
      description: 'Dividend payment'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Dividend payment transactions should be included'
    );
  });

  it('should include interest transactions', () => {
    const transaction = {
      account: 'Cash',
      type: 'Interest',
      amount: '5.00',
      description: 'Interest earned'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Interest transactions should be included'
    );
  });

  it('should include fee transactions', () => {
    const transaction = {
      account: 'TFSA',
      type: 'Fee',
      amount: '10.00',
      description: 'Management fee'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Fee transactions should be included'
    );
  });

  it('should include transfer transactions', () => {
    const transaction = {
      account: 'Cash',
      type: 'Transfer',
      amount: '1000.00',
      description: 'Transfer to savings',
      from: 'Cash',
      to: 'Savings'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Transfer transactions should be included'
    );
  });

  it('should handle transactions with no type', () => {
    const transaction = {
      account: 'Cash',
      amount: '100.00',
      description: 'Unknown transaction'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Transactions with no type should be included by default'
    );
  });

  it('should handle transactions with null type', () => {
    const transaction = {
      account: 'Cash',
      type: null,
      amount: '100.00',
      description: 'Transaction with null type'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Transactions with null type should be included by default'
    );
  });

  it('should handle transactions with empty string type', () => {
    const transaction = {
      account: 'Cash',
      type: '',
      amount: '100.00',
      description: 'Transaction with empty type'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction),
      true,
      'Transactions with empty type should be included by default'
    );
  });

  it('should not partially match type names', () => {
    // Test that "Market" alone doesn't match "Market buy"
    const transaction1 = {
      account: 'TFSA',
      type: 'Market',
      amount: '100.00'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction1),
      true,
      'Type "Market" alone should not be filtered'
    );

    // Test that "buy" alone doesn't match "Market buy"
    const transaction2 = {
      account: 'TFSA',
      type: 'Buy',
      amount: '100.00'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction2),
      true,
      'Type "Buy" alone should not be filtered'
    );

    // Test that "Dividend" alone doesn't match "Dividend reinvested"
    const transaction3 = {
      account: 'TFSA',
      type: 'Dividend',
      amount: '25.00'
    };

    assert.strictEqual(
      shouldIncludeTransaction(transaction3),
      true,
      'Type "Dividend" alone should not be filtered'
    );
  });

  it('should filter multiple investment transactions in a batch', () => {
    const transactions = [
      { type: 'Deposit', account: 'TFSA', amount: '1000.00' },
      { type: 'Market buy', account: 'TFSA', amount: '500.00' },
      { type: 'Market sell', account: 'TFSA', amount: '300.00' },
      { type: 'Dividend reinvested', account: 'TFSA', amount: '25.00' },
      { type: 'Dividend', account: 'TFSA', amount: '25.00' },
      { type: 'Fractional buy', account: 'TFSA', amount: '100.00' },
      { type: 'Withdrawal', account: 'TFSA', amount: '200.00' }
    ];

    const filtered = transactions.filter(shouldIncludeTransaction);

    assert.strictEqual(filtered.length, 3, 'Should filter out 4 investment transactions');
    assert.strictEqual(filtered[0].type, 'Deposit', 'Deposit should be included');
    assert.strictEqual(filtered[1].type, 'Dividend', 'Dividend should be included');
    assert.strictEqual(filtered[2].type, 'Withdrawal', 'Withdrawal should be included');
  });
});
