#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  importTransactions,
  listAccounts,
  generateAccountConfig,
  validateAccountMappings,
  login,
  logout
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

const program = new Command();

program
  .name('ws-actual')
  .description('Import WealthSimple transactions to ActualBudget')
  .version(packageJson.version);

// Login command
program
  .command('login')
  .description('Interactive login to ActualBudget')
  .option('--config <path>', 'Path to custom config.toml file')
  .action(async (options) => {
    try {
      await login(options);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Logout command
program
  .command('logout')
  .description('Logout from ActualBudget (clear cache and stored passwords)')
  .option('--server-url <url>', 'ActualBudget server URL (for password clearing)')
  .option('--config <path>', 'Path to custom config.toml file')
  .action(async (options) => {
    try {
      await logout(options);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Import command
program
  .command('import')
  .description('Import transactions from WealthSimple (launches browser)')
  .option('--sync-id <id>', 'ActualBudget sync ID (from Settings → Advanced → Sync ID)')
  .option('--server-url <url>', 'ActualBudget server URL')
  .option('--password <password>', 'ActualBudget password')
  .option('--remote-browser-url <url>', 'Connect to existing browser via Chrome DevTools Protocol')
  .option('--dry-run', 'Preview import without making changes')
  .option('--verbose', 'Show detailed output')
  .option('--add-missing-accounts', 'Prompt to map unmapped account names to ActualBudget accounts')
  .action(async (options) => {
    try {
      // Merge global options with command options
      const globalOptions = program.opts();
      const mergedOptions = { ...options, ...globalOptions };

      await importTransactions(mergedOptions);

      if (!options.dryRun) {
        console.log('\nImport completed successfully!');
      }

      process.exit(0);
    } catch (error) {
      console.error('\nError:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Accounts command group
const accounts = program.command('accounts').description('Manage ActualBudget accounts');

// List accounts
accounts
  .command('list')
  .description('List all ActualBudget accounts')
  .option('--sync-id <id>', 'ActualBudget sync ID (from Settings → Advanced → Sync ID)')
  .option('--server-url <url>', 'ActualBudget server URL')
  .option('--password <password>', 'ActualBudget password')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      await listAccounts(options);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Generate config
accounts
  .command('generate-config')
  .description('Interactively map ActualBudget accounts to WealthSimple account names')
  .option('--sync-id <id>', 'ActualBudget sync ID (from Settings → Advanced → Sync ID)')
  .option('--server-url <url>', 'ActualBudget server URL')
  .option('--password <password>', 'ActualBudget password')
  .action(async (options) => {
    try {
      await generateAccountConfig(options);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Validate mappings
accounts
  .command('validate')
  .description('Validate account mappings')
  .option('--sync-id <id>', 'ActualBudget sync ID (from Settings → Advanced → Sync ID)')
  .option('--server-url <url>', 'ActualBudget server URL')
  .option('--password <password>', 'ActualBudget password')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      const results = await validateAccountMappings(options);

      const isValid = results.invalid.length === 0;
      process.exit(isValid ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Global options
program.option(
  '--config <path>',
  'Path to custom config.toml file (overrides ~/.config/ws-actual/config.toml)'
);

// Error handling
program.exitOverride();

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error.code === 'commander.help') {
      process.exit(0);
    }
    console.error(error.message);
    process.exit(1);
  }
})();
