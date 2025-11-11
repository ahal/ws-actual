import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveAccount } from '../src/config.js';

/**
 * Unit test for account resolution logic
 * Tests the core account mapping functionality without external dependencies
 */

const testCases = [
  {
    description: 'should match exact account name',
    wsAccountName: 'WealthSimple Cash',
    config: {
      accounts: [
        {
          wsAccountName: 'WealthSimple Cash',
          actualAccountId: 'account-id-1'
        }
      ]
    },
    expected: {
      accountId: 'account-id-1',
      accountName: 'WealthSimple Cash',
      needsLookup: false,
      matchType: 'exact',
      matchedPattern: 'WealthSimple Cash'
    }
  },

  {
    description: 'should not match when names differ',
    wsAccountName: 'My TFSA Investment',
    config: {
      accounts: [
        {
          wsAccountName: 'TFSA',
          actualAccountId: 'tfsa-account-id'
        }
      ]
    },
    expected: null
  },

  {
    description: 'should return null for unmapped account',
    wsAccountName: 'Unknown Account',
    config: {
      accounts: [
        {
          wsAccountName: 'WealthSimple Cash',
          actualAccountId: 'account-id-1'
        }
      ]
    },
    expected: null
  },

  {
    description: 'should match first exact match when multiple accounts exist',
    wsAccountName: 'Joint Chequing',
    config: {
      accounts: [
        {
          wsAccountName: 'Joint Chequing',
          actualAccountId: 'joint-account-id'
        },
        {
          wsAccountName: 'Joint Savings',
          actualAccountId: 'other-joint-id'
        }
      ]
    },
    expected: {
      accountId: 'joint-account-id',
      accountName: 'Joint Chequing',
      needsLookup: false,
      matchType: 'exact',
      matchedPattern: 'Joint Chequing'
    }
  },

  {
    description: 'should handle case-insensitive matching',
    wsAccountName: 'wealthsimple cash',
    config: {
      accounts: [
        {
          wsAccountName: 'WealthSimple Cash',
          actualAccountId: 'account-id-1'
        }
      ]
    },
    expected: {
      accountId: 'account-id-1',
      accountName: 'wealthsimple cash',
      needsLookup: false,
      matchType: 'exact',
      matchedPattern: 'WealthSimple Cash'
    }
  },

  {
    description: 'should handle empty config',
    wsAccountName: 'WealthSimple Cash',
    config: {
      accounts: []
    },
    expected: null
  },

  {
    description: 'should handle null config',
    wsAccountName: 'WealthSimple Cash',
    config: null,
    expected: null
  },

  {
    description: 'should match exact account name with special characters',
    wsAccountName: 'Test Account [Special]',
    config: {
      accounts: [
        {
          wsAccountName: 'Other Account',
          actualAccountId: 'account-id-1'
        },
        {
          wsAccountName: 'Test Account [Special]',
          actualAccountId: 'account-id-2'
        }
      ]
    },
    expected: {
      accountId: 'account-id-2',
      accountName: 'Test Account [Special]',
      needsLookup: false,
      matchType: 'exact',
      matchedPattern: 'Test Account [Special]'
    }
  },

  {
    description: 'should skip entries with missing fields',
    wsAccountName: 'WealthSimple Cash',
    config: {
      accounts: [
        {
          wsAccountName: 'WealthSimple Cash'
          // Missing actualAccountId
        },
        {
          actualAccountId: 'account-id-2'
          // Missing wsAccountName
        },
        {
          wsAccountName: 'WealthSimple Cash',
          actualAccountId: 'account-id-3'
        }
      ]
    },
    expected: {
      accountId: 'account-id-3',
      accountName: 'WealthSimple Cash',
      needsLookup: false,
      matchType: 'exact',
      matchedPattern: 'WealthSimple Cash'
    }
  }
];

describe('Account Resolution Unit Tests', () => {
  testCases.forEach((testCase, index) => {
    it(`Test ${index + 1}: ${testCase.description}`, () => {
      const result = resolveAccount(testCase.wsAccountName, testCase.config);

      if (testCase.expected === null) {
        assert.strictEqual(result, null, 'Expected null result for unmapped account');
      } else {
        assert.notStrictEqual(result, null, 'Expected non-null result for mapped account');
        assert.strictEqual(
          result.accountId,
          testCase.expected.accountId,
          'Account ID should match'
        );
        assert.strictEqual(
          result.accountName,
          testCase.expected.accountName,
          'Account name should match'
        );
        assert.strictEqual(
          result.needsLookup,
          testCase.expected.needsLookup,
          'needsLookup should match'
        );
        assert.strictEqual(
          result.matchType,
          testCase.expected.matchType,
          'Match type should match'
        );
        assert.strictEqual(
          result.matchedPattern,
          testCase.expected.matchedPattern,
          'Matched pattern should match'
        );
      }
    });
  });
});

/**
 * Helper function to create test cases easily
 */
export function createAccountResolutionTest({ description, wsAccountName, config, expected }) {
  return {
    description,
    wsAccountName,
    config,
    expected
  };
}
