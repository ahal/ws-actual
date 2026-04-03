import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  saveConfig,
  resolveAccount,
  validateConfig,
  getDefaultConfig
} from '../src/config.js';

/**
 * Integration tests for configuration management
 * Tests the full workflow of loading, saving, and validating configs
 */

describe('Config Integration Tests', () => {
  let testDir;
  let testConfigPath;

  beforeEach(async () => {
    // Create a temporary directory for test configs
    testDir = join(tmpdir(), `ws-actual-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testConfigPath = join(testDir, 'config.toml');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Config Loading', () => {
    it('should load default config when file does not exist', async () => {
      const config = await loadConfig(join(testDir, 'nonexistent.toml'));

      assert.ok(config, 'Should return a config object');
      assert.ok(config.actualServer, 'Should have actualServer section');
      assert.ok(Array.isArray(config.accounts), 'Should have accounts array');
      assert.strictEqual(config.accounts.length, 0, 'Should have empty accounts');
    });

    it('should load valid TOML config file', async () => {
      const tomlContent = `
[actualServer]
url = "http://localhost:5006"
syncId = "test-budget-id"

[[accounts]]
wsAccountName = "WealthSimple Cash"
actualAccountId = "acc_001"
`;
      await writeFile(testConfigPath, tomlContent);

      const config = await loadConfig(testConfigPath);

      assert.strictEqual(config.actualServer.url, 'http://localhost:5006');
      assert.strictEqual(config.actualServer.syncId, 'test-budget-id');
      assert.strictEqual(config.accounts.length, 1);
      assert.strictEqual(config.accounts[0].wsAccountName, 'WealthSimple Cash');
      assert.strictEqual(config.accounts[0].actualAccountId, 'acc_001');
    });

    it('should handle config with multiple accounts', async () => {
      const tomlContent = `
[actualServer]
url = "http://localhost:5006"
syncId = "test-budget-id"

[[accounts]]
wsAccountName = "WealthSimple Cash"
actualAccountId = "acc_001"

[[accounts]]
wsAccountName = "Savings Account"
actualAccountId = "acc_002"

[[accounts]]
wsAccountName = "Investment Account"
actualAccountId = "acc_003"
`;
      await writeFile(testConfigPath, tomlContent);

      const config = await loadConfig(testConfigPath);

      assert.strictEqual(config.accounts.length, 3);
      assert.strictEqual(config.accounts[0].wsAccountName, 'WealthSimple Cash');
      assert.strictEqual(config.accounts[1].wsAccountName, 'Savings Account');
      assert.strictEqual(config.accounts[2].wsAccountName, 'Investment Account');
    });

    it('should handle config with missing accounts section', async () => {
      const tomlContent = `
[actualServer]
url = "http://localhost:5006"
syncId = "test-budget-id"
`;
      await writeFile(testConfigPath, tomlContent);

      const config = await loadConfig(testConfigPath);

      assert.ok(Array.isArray(config.accounts), 'Should have accounts array');
      assert.strictEqual(config.accounts.length, 0);
    });

    it('should handle invalid TOML syntax gracefully', async () => {
      const invalidToml = `
[actualServer
url = "http://localhost:5006"
`;
      await writeFile(testConfigPath, invalidToml);

      // Should not throw, should return default config
      const config = await loadConfig(testConfigPath);
      assert.ok(config);
      assert.ok(config.actualServer);
    });
  });

  describe('Config Saving', () => {
    it('should save config to file', async () => {
      const config = {
        actualServer: {
          url: 'http://test.local:5006',
          syncId: 'new-budget-id'
        },
        accounts: [
          {
            wsAccountName: 'Test Account',
            actualAccountId: 'acc_test_001'
          }
        ]
      };

      await saveConfig(config, testConfigPath);

      // Load it back to verify
      const loadedConfig = await loadConfig(testConfigPath);
      assert.strictEqual(loadedConfig.actualServer.url, 'http://test.local:5006');
      assert.strictEqual(loadedConfig.actualServer.syncId, 'new-budget-id');
    });

    it('should create config directory if it does not exist', async () => {
      const newTestDir = join(testDir, 'nested', 'path');
      const nestedConfigPath = join(newTestDir, 'config.toml');

      const config = {
        actualServer: {
          url: 'http://localhost:5006',
          syncId: 'test-id'
        },
        accounts: []
      };

      // This will create the directory
      await saveConfig(config, nestedConfigPath);

      // Verify it was created by loading it back
      const loadedConfig = await loadConfig(nestedConfigPath);
      assert.strictEqual(loadedConfig.actualServer.url, 'http://localhost:5006');
    });
  });

  describe('Account Resolution', () => {
    it('should resolve exact account name match', () => {
      const config = {
        accounts: [
          {
            wsAccountName: 'WealthSimple Cash',
            actualAccountId: 'acc_001'
          }
        ]
      };

      const result = resolveAccount('WealthSimple Cash', config);

      assert.ok(result, 'Should find account');
      assert.strictEqual(result.accountId, 'acc_001');
      assert.strictEqual(result.accountName, 'WealthSimple Cash');
      assert.strictEqual(result.needsLookup, false);
      assert.strictEqual(result.matchType, 'exact');
    });

    it('should resolve case-insensitive account name', () => {
      const config = {
        accounts: [
          {
            wsAccountName: 'WealthSimple Cash',
            actualAccountId: 'acc_001'
          }
        ]
      };

      const result = resolveAccount('wealthsimple cash', config);

      assert.ok(result, 'Should find account with different case');
      assert.strictEqual(result.accountId, 'acc_001');
    });

    it('should return null for unmapped account', () => {
      const config = {
        accounts: [
          {
            wsAccountName: 'WealthSimple Cash',
            actualAccountId: 'acc_001'
          }
        ]
      };

      const result = resolveAccount('Unknown Account', config);

      assert.strictEqual(result, null, 'Should return null for unmapped account');
    });

    it('should handle empty config', () => {
      const config = { accounts: [] };

      const result = resolveAccount('Any Account', config);

      assert.strictEqual(result, null);
    });

    it('should handle null config', () => {
      const result = resolveAccount('Any Account', null);

      assert.strictEqual(result, null);
    });

    it('should skip accounts with missing fields', () => {
      const config = {
        accounts: [
          {
            wsAccountName: 'WealthSimple Cash'
            // Missing actualAccountId
          },
          {
            actualAccountId: 'acc_002'
            // Missing wsAccountName
          },
          {
            wsAccountName: 'Valid Account',
            actualAccountId: 'acc_003'
          }
        ]
      };

      const result = resolveAccount('Valid Account', config);

      assert.ok(result, 'Should find valid account');
      assert.strictEqual(result.accountId, 'acc_003');
    });

    it('should return first matching account', () => {
      const config = {
        accounts: [
          {
            wsAccountName: 'Duplicate Account',
            actualAccountId: 'acc_001'
          },
          {
            wsAccountName: 'Duplicate Account',
            actualAccountId: 'acc_002'
          }
        ]
      };

      const result = resolveAccount('Duplicate Account', config);

      assert.ok(result);
      assert.strictEqual(result.accountId, 'acc_001', 'Should return first match');
    });
  });

  describe('Config Validation', () => {
    it('should validate complete config', () => {
      const config = {
        serverUrl: 'http://localhost:5006',
        password: 'test-password',
        budgetId: 'test-budget-id'
      };

      validateConfig(config);

      // validateConfig doesn't return a result, it throws or logs
      // If we get here without throwing, validation passed
      assert.ok(true, 'Validation should pass for complete config');
    });

    it('should detect missing server URL', () => {
      const config = {
        serverUrl: '',
        password: 'test-password',
        budgetId: 'test-budget-id'
      };

      // Should throw an error for missing server URL
      assert.throws(() => {
        validateConfig(config);
      }, /ActualBudget is not configured/);
    });

    it('should detect missing budget ID', () => {
      const config = {
        serverUrl: 'http://localhost:5006',
        password: 'test-password',
        budgetId: ''
      };

      // Should throw an error for missing budget ID
      assert.throws(() => {
        validateConfig(config);
      }, /ActualBudget is not configured/);
    });
  });

  describe('Default Config', () => {
    it('should return valid default config', () => {
      const config = getDefaultConfig();

      assert.ok(config.actualServer, 'Should have actualServer section');
      assert.strictEqual(config.actualServer.url, null, 'URL should be null (not configured)');
      assert.strictEqual(config.actualServer.syncId, null, 'Sync ID should be null');
      assert.ok(Array.isArray(config.accounts), 'Should have accounts array');
      assert.strictEqual(config.accounts.length, 0);
    });
  });

  describe('Config Round-Trip', () => {
    it('should preserve data through save and load cycle', async () => {
      const originalConfig = {
        actualServer: {
          url: 'http://custom.local:5006',
          syncId: 'custom-budget-id'
        },
        accounts: [
          {
            wsAccountName: 'Account One',
            actualAccountId: 'acc_001'
          },
          {
            wsAccountName: 'Account Two',
            actualAccountId: 'acc_002'
          }
        ]
      };

      // Save config to test path
      await saveConfig(originalConfig, testConfigPath);

      // Load config back from test path
      const loadedConfig = await loadConfig(testConfigPath);

      // Verify the essential data is preserved
      assert.strictEqual(loadedConfig.actualServer.url, originalConfig.actualServer.url);
      assert.strictEqual(loadedConfig.actualServer.syncId, originalConfig.actualServer.syncId);
      assert.strictEqual(loadedConfig.accounts.length, originalConfig.accounts.length);
    });
  });
});
