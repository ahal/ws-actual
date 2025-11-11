import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getConfigDir, getDefaultConfig } from '../src/config.js';

/**
 * Unit tests for config helper functions
 */

describe('Config Helper Functions', () => {
  describe('getConfigDir', () => {
    it('should return a valid config directory path', () => {
      const configDir = getConfigDir();

      assert.ok(configDir, 'Config directory should be defined');
      assert.ok(typeof configDir === 'string', 'Config directory should be a string');
      assert.ok(configDir.includes('ws-actual'), 'Config directory should contain "ws-actual"');
    });

    it('should use platform-specific paths', () => {
      const configDir = getConfigDir();
      const platform = process.platform;

      if (platform === 'darwin') {
        assert.ok(
          configDir.includes('Library/Application Support') || configDir.includes('.config'),
          'macOS should use Library/Application Support or .config'
        );
      } else if (platform === 'win32') {
        assert.ok(
          configDir.includes('AppData') || configDir.includes('.config'),
          'Windows should use AppData or .config'
        );
      } else {
        assert.ok(
          configDir.includes('.config'),
          'Linux should use .config'
        );
      }
    });

    it('should return absolute path', () => {
      const configDir = getConfigDir();
      assert.ok(
        configDir.startsWith('/') || /^[A-Z]:\\/.test(configDir),
        'Config directory should be absolute path'
      );
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration object', () => {
      const defaultConfig = getDefaultConfig();

      assert.ok(defaultConfig, 'Default config should be defined');
      assert.ok(typeof defaultConfig === 'object', 'Default config should be an object');
    });

    it('should have actualServer property', () => {
      const defaultConfig = getDefaultConfig();

      assert.ok('actualServer' in defaultConfig, 'Should have actualServer property');
      assert.ok(
        typeof defaultConfig.actualServer === 'object',
        'actualServer should be an object'
      );
    });

    it('should have null url and syncId in actualServer', () => {
      const defaultConfig = getDefaultConfig();

      assert.strictEqual(
        defaultConfig.actualServer.url,
        null,
        'Default URL should be null'
      );
      assert.strictEqual(
        defaultConfig.actualServer.syncId,
        null,
        'Default syncId should be null'
      );
    });

    it('should have empty accounts array', () => {
      const defaultConfig = getDefaultConfig();

      assert.ok('accounts' in defaultConfig, 'Should have accounts property');
      assert.ok(Array.isArray(defaultConfig.accounts), 'accounts should be an array');
      assert.strictEqual(defaultConfig.accounts.length, 0, 'accounts should be empty');
    });

    it('should return new object on each call', () => {
      const config1 = getDefaultConfig();
      const config2 = getDefaultConfig();

      assert.notStrictEqual(config1, config2, 'Should return different object instances');
      config1.accounts.push({ test: 'value' });
      assert.strictEqual(config2.accounts.length, 0, 'Modifying one should not affect the other');
    });
  });

  describe('getDefaultConfig structure validation', () => {
    it('should have all required top-level properties', () => {
      const defaultConfig = getDefaultConfig();
      const requiredProps = ['actualServer', 'accounts'];

      requiredProps.forEach((prop) => {
        assert.ok(
          prop in defaultConfig,
          `Default config should have "${prop}" property`
        );
      });
    });

    it('should have all required actualServer properties', () => {
      const defaultConfig = getDefaultConfig();
      const requiredProps = ['url', 'syncId'];

      requiredProps.forEach((prop) => {
        assert.ok(
          prop in defaultConfig.actualServer,
          `actualServer should have "${prop}" property`
        );
      });
    });

    it('should not have extra unexpected properties', () => {
      const defaultConfig = getDefaultConfig();
      const expectedProps = ['actualServer', 'accounts'];

      const actualProps = Object.keys(defaultConfig);
      actualProps.forEach((prop) => {
        assert.ok(
          expectedProps.includes(prop),
          `Unexpected property "${prop}" in default config`
        );
      });
    });
  });
});
