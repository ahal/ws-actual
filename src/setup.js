import * as api from '@actual-app/api';
import { join } from 'path';
import { xdgData } from 'xdg-basedir';
import { mkdir } from 'fs/promises';
import { createReadlineInterface, askQuestion, askPassword } from './util/prompt-helpers.js';
import { loadConfig, saveConfig, storePassword } from './config.js';
import { getStoredPassword } from './util/keyring-helpers.js';
import { scrapeTransactions } from './scraper.js';
import { getUniqueAccounts, promptForAccountMapping } from './account-mapper.js';
import { createClient } from './actual-client.js';

/**
 * Suppress all console output during async operation
 * @param {Function} fn - Async function to execute with suppressed console
 * @returns {Promise<any>} Result of the function
 */
async function suppressConsole(fn) {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.debug = () => {};

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  }
}

/**
 * Setup wizard - combines login and account mapping
 * @param {Object} options CLI options
 * @returns {Promise<void>}
 */
export async function setup(options = {}) {
  const rl = createReadlineInterface();

  try {
    console.log('🚀 WealthSimple to ActualBudget Setup Wizard\n');

    // Step 1: Login to ActualBudget
    console.log('Step 1: Connect to ActualBudget\n');
    console.log(`${'─'.repeat(50)}\n`);

    // Load existing config
    const fullConfig = await loadConfig(options.config);

    // Prompt for server URL
    const defaultUrl = fullConfig.actualServer?.url || 'http://localhost:5006';
    const serverUrlPrompt = await askQuestion(rl, `ActualBudget server URL [${defaultUrl}]: `);
    const serverUrl = serverUrlPrompt || defaultUrl;

    // Check if password already exists in keyring
    const existingPassword = await getStoredPassword(serverUrl);
    let password;

    if (existingPassword) {
      console.log('\n✓ Found stored password for this server');
      const shouldUpdatePassword = await askQuestion(
        rl,
        'Would you like to update the stored password? (y/N): '
      );

      if (
        shouldUpdatePassword.toLowerCase() === 'y' ||
        shouldUpdatePassword.toLowerCase() === 'yes'
      ) {
        // User wants to update password
        password = await askPassword(rl, 'New password: ');

        if (!password) {
          throw new Error('Password is required');
        }

        // Update stored password
        const stored = await storePassword(serverUrl, password);
        if (stored) {
          console.log('✅ Password updated in system keyring');
        } else {
          console.log('⚠️  Password could not be updated (keyring may not be available)');
        }
      } else {
        // Use existing password
        password = existingPassword;
        console.log('Using existing stored password');
      }
    } else {
      // No existing password, prompt for new one
      password = await askPassword(rl, 'Password: ');

      if (!password) {
        throw new Error('Password is required');
      }

      // Ask about storing password right after entering it
      const shouldStorePassword = await askQuestion(
        rl,
        '\nStore password in system keyring for future use? (y/N): '
      );

      if (
        shouldStorePassword.toLowerCase() === 'y' ||
        shouldStorePassword.toLowerCase() === 'yes'
      ) {
        const stored = await storePassword(serverUrl, password);
        if (stored) {
          console.log('✅ Password stored securely in system keyring');
        } else {
          console.log('⚠️  Password could not be stored (keyring may not be available)');
        }
      }
    }

    // Initialize API to get budgets
    console.log('\nConnecting to ActualBudget server...');
    const dataDir = join(xdgData, 'ws-actual');

    // Ensure data directory exists
    await mkdir(dataDir, { recursive: true });

    // Suppress console logs from API if not in verbose mode
    if (!options.verbose) {
      await suppressConsole(async () => {
        await api.init({
          dataDir: dataDir,
          serverURL: serverUrl,
          password: password
        });
      });
    } else {
      await api.init({
        dataDir: dataDir,
        serverURL: serverUrl,
        password: password
      });
    }

    // Get available budgets
    console.log('Fetching available budgets...');
    let allBudgets;
    if (!options.verbose) {
      allBudgets = await suppressConsole(async () => {
        return await api.getBudgets();
      });
    } else {
      allBudgets = await api.getBudgets();
    }

    if (!allBudgets || allBudgets.length === 0) {
      throw new Error('No budgets found on the server');
    }

    // Deduplicate budgets by groupId (API sometimes returns duplicates)
    const seenIds = new Set();
    const budgets = allBudgets.filter((budget) => {
      if (seenIds.has(budget.groupId)) {
        return false;
      }
      seenIds.add(budget.groupId);
      return true;
    });

    // Find currently configured budget if any
    const currentSyncId = fullConfig.actualServer?.syncId;
    const currentBudgetIndex = currentSyncId
      ? budgets.findIndex((b) => b.groupId === currentSyncId)
      : -1;

    // Display budgets and prompt for selection
    console.log('\nAvailable budgets on this server:');
    budgets.forEach((budget, index) => {
      const isCurrent = index === currentBudgetIndex;
      const marker = isCurrent ? ' [current]' : '';
      console.log(`  ${index + 1}. ${budget.name}${marker} (ID: ${budget.groupId})`);
    });

    let selectedBudget;
    if (budgets.length === 1) {
      selectedBudget = budgets[0];
      console.log(`\nAutomatically selecting the only available budget: ${selectedBudget.name}`);
    } else {
      // Prepare the prompt with default value
      let prompt = '\nSelect a budget (enter number)';
      if (currentBudgetIndex >= 0) {
        prompt += ` [${currentBudgetIndex + 1}]`;
      }
      prompt += ': ';

      const selection = await askQuestion(rl, prompt);

      // If empty and there's a current budget, use it
      if (!selection && currentBudgetIndex >= 0) {
        selectedBudget = budgets[currentBudgetIndex];
        console.log(`Using current budget: ${selectedBudget.name}`);
      } else {
        const index = parseInt(selection) - 1;

        if (isNaN(index) || index < 0 || index >= budgets.length) {
          throw new Error('Invalid budget selection');
        }

        selectedBudget = budgets[index];
      }
    }

    // Get the sync ID from the budget's groupId field
    console.log(`\n📝 Selected budget: ${selectedBudget.name}`);
    const selectedSyncId = selectedBudget.groupId;

    if (selectedSyncId) {
      console.log(`✅ Sync ID: ${selectedSyncId}`);
    } else {
      console.warn('⚠️  Warning: No sync ID found for this budget');
    }

    // Update config with server URL and sync ID
    if (!fullConfig.actualServer) {
      fullConfig.actualServer = {};
    }

    fullConfig.actualServer.url = serverUrl;
    fullConfig.actualServer.syncId = selectedSyncId;

    await saveConfig(fullConfig);
    console.log('\n✅ ActualBudget connection configured successfully');

    // Shutdown API before proceeding to account mapping
    await api.shutdown();

    // Step 2: Ask about automatic account mapping
    console.log('\n\nStep 2: Account Mapping\n');
    console.log(`${'─'.repeat(50)}\n`);

    const shouldMapAccounts = await askQuestion(
      rl,
      'Would you like to automatically map WealthSimple accounts to ActualBudget accounts? (Y/n): '
    );

    if (shouldMapAccounts.toLowerCase() === 'n' || shouldMapAccounts.toLowerCase() === 'no') {
      console.log('\n⏭️  Skipping automatic account mapping.');
      console.log('\nSetup complete! You can now import transactions with:');
      console.log('  ws-actual import');
      console.log(
        '\nNote: You will need to manually configure account mappings in config.toml before importing.'
      );
      return;
    }

    // Step 3: Scrape WealthSimple to get account names
    console.log('\n📊 Extracting account information from WealthSimple...');
    console.log('(This will launch a browser window for authentication)\n');

    let wsTransactions;
    try {
      if (options.remoteBrowserUrl) {
        console.log('Connecting to remote browser...');
      } else {
        console.log('Launching browser...');
      }

      wsTransactions = await scrapeTransactions({
        verbose: options.verbose,
        remoteBrowserUrl: options.remoteBrowserUrl
      });

      if (wsTransactions.length === 0) {
        console.log('\n⚠️  No transactions found. Cannot determine account names.');
        console.log('You may need to manually configure account mappings in config.toml.');
        return;
      }

      console.log(`✅ Found ${wsTransactions.length} transactions\n`);
    } catch (error) {
      console.error('\n❌ Failed to extract account information:', error.message);
      console.log(
        'You can still use ws-actual by manually configuring account mappings in config.toml.'
      );
      return;
    }

    // Step 4: Get unique accounts from transactions
    const uniqueAccounts = getUniqueAccounts(wsTransactions);
    console.log(`📋 Detected ${uniqueAccounts.length} WealthSimple account(s):\n`);
    uniqueAccounts.forEach((account, index) => {
      console.log(`  ${index + 1}. ${account}`);
    });

    // Step 5: Connect to ActualBudget to map accounts
    console.log('\n🔗 Connecting to ActualBudget for account mapping...');
    const client = await createClient({
      serverUrl: serverUrl,
      password: password,
      budgetId: selectedSyncId,
      verbose: options.verbose
    });

    try {
      console.log('✅ Connected\n');

      // Step 6: Prompt for mapping each account
      let mappedCount = 0;
      for (const wsAccount of uniqueAccounts) {
        console.log(`\n🏦 WealthSimple Account: "${wsAccount}"`);

        const resolvedMapping = await promptForAccountMapping(wsAccount, client, fullConfig, rl);

        if (resolvedMapping) {
          mappedCount++;
        }
      }

      // Summary
      console.log('\n\n✨ Setup Complete!\n');
      console.log('─'.repeat(50));
      console.log('\n📊 Summary:');
      console.log(`   ActualBudget Server: ${serverUrl}`);
      console.log(`   Budget: ${selectedBudget.name}`);
      console.log(`   Accounts mapped: ${mappedCount} / ${uniqueAccounts.length}`);

      if (mappedCount < uniqueAccounts.length) {
        console.log(`\n⚠️  ${uniqueAccounts.length - mappedCount} account(s) were not mapped.`);
        console.log('   Transactions from unmapped accounts will be skipped during import.');
      }

      console.log('\n🎉 You can now import transactions with:');
      console.log('   ws-actual import');
    } finally {
      await client.shutdown();
    }
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    rl.close();
  }
}

export default {
  setup
};
