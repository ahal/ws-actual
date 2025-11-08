#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { importTransactions, setup, setupAccounts } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

const program = new Command();

/**
 * Collector function for options that can be specified multiple times
 * @param {string} value - The new value
 * @param {Array} previous - Previously collected values
 * @returns {Array} Updated array of values
 */
function collect(value, previous) {
  return previous.concat([value]);
}

program
  .name('ws-actual')
  .description('Import WealthSimple transactions to ActualBudget')
  .version(packageJson.version);

// Setup command with nested subcommands
const setupCommand = program
  .command('setup')
  .description('Interactive setup - connect to ActualBudget and map accounts')
  .option('--config <path>', 'Path to custom config.toml file')
  .option('--remote-browser-url <url>', 'Connect to existing browser via Chrome DevTools Protocol')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      await setup(options);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Setup accounts nested subcommand
setupCommand
  .command('accounts')
  .description('Map WealthSimple accounts to ActualBudget accounts (skip server config)')
  .option('--all', 'Map all accounts (including already mapped)')
  .option('--config <path>', 'Path to custom config.toml file')
  .option('--remote-browser-url <url>', 'Connect to existing browser via Chrome DevTools Protocol')
  .option('--verbose', 'Show detailed output')
  .action(async (options, command) => {
    // Merge parent options with subcommand options
    const parentOptions = command.parent?.opts() || {};
    const mergedOptions = { ...parentOptions, ...options };

    try {
      await setupAccounts(mergedOptions);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      if (mergedOptions.verbose) {
        console.error(error.stack);
      }
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
  .option('--timeframe <value>', 'Time range for transactions: all, last-week, last-30-days, last-60-days, last-90-days (default: last-30-days)', 'last-30-days')
  .option('--adjust-balances', 'Adjust account balances after import to match WealthSimple')
  .option('--account <name>', 'Only import from specified account (can be used multiple times)', collect, [])
  .option('--dry-run', 'Preview import without making changes')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      // Validate timeframe option
      const validTimeframes = ['all', 'last-week', 'last-30-days', 'last-60-days', 'last-90-days'];
      if (!validTimeframes.includes(options.timeframe)) {
        console.error(`Error: Invalid timeframe '${options.timeframe}'. Valid values: ${validTimeframes.join(', ')}`);
        process.exit(1);
      }

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
