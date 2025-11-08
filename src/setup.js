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
 * Perform account mapping
 * @param {Object} options - Options
 * @param {boolean} options.mapAllAccounts - Map all accounts (true) or only unmapped (false)
 * @param {boolean} options.verbose - Verbose output
 * @param {string} options.remoteBrowserUrl - Remote browser URL
 * @param {string} options.config - Config file path
 * @param {Object} rl - Readline interface
 * @returns {Promise<void>}
 */
async function performAccountMapping(options, rl) {
  const { mapAllAccounts, verbose, remoteBrowserUrl, config: configPath } = options;

  // Load existing config
  const fullConfig = await loadConfig(configPath);

  if (!fullConfig.actualServer?.url || !fullConfig.actualServer?.syncId) {
    throw new Error(
      'ActualBudget is not configured. Please run "ws-actual setup" first to configure your server and budget.'
    );
  }

  const serverUrl = fullConfig.actualServer.url;
  const selectedSyncId = fullConfig.actualServer.syncId;

  // Get password
  const password = await getStoredPassword(serverUrl);
  if (!password) {
    throw new Error(
      `No password found for ${serverUrl}. Please run "ws-actual setup" to store your password.`
    );
  }

  // Scrape WealthSimple to get account names
  console.log('📊 Extracting account information from WealthSimple...');
  console.log('(This will launch a browser window for authentication)\n');

  let wsTransactions;
  try {
    if (remoteBrowserUrl) {
      console.log('Connecting to remote browser...');
    } else {
      console.log('Launching browser...');
    }

    wsTransactions = await scrapeTransactions({
      verbose,
      remoteBrowserUrl,
      timeframe: 'last-30-days'
    });

    if (wsTransactions.length === 0) {
      console.log('\n⚠️  No transactions found. Cannot determine account names.');
      console.log('You may need to manually configure account mappings in config.toml.');
      return;
    }

    console.log(`✅ Found ${wsTransactions.length} transactions\n`);
  } catch (error) {
    console.error('\n❌ Failed to extract account information:', error.message);
    console.log('You can still use ws-actual by manually configuring account mappings in config.toml.');
    throw error;
  }

  // Get unique accounts from transactions
  const allUniqueAccounts = getUniqueAccounts(wsTransactions);

  // Filter accounts based on user choice
  let accountsToMap;
  if (mapAllAccounts) {
    // Map all accounts
    accountsToMap = allUniqueAccounts;
    console.log(`📋 Detected ${allUniqueAccounts.length} WealthSimple account(s):\n`);
    accountsToMap.forEach((account, index) => {
      console.log(`  ${index + 1}. ${account}`);
    });
  } else {
    // Only map unmapped accounts
    const existingMappings = fullConfig.accounts || [];
    const mappedAccountNames = new Set(existingMappings.map((acc) => acc.wsAccountName));
    accountsToMap = allUniqueAccounts.filter((acc) => !mappedAccountNames.has(acc));

    const alreadyMappedCount = allUniqueAccounts.length - accountsToMap.length;

    console.log(`📋 Detected ${allUniqueAccounts.length} WealthSimple account(s)`);
    console.log(`   ${alreadyMappedCount} already mapped, ${accountsToMap.length} unmapped:\n`);

    if (alreadyMappedCount > 0) {
      console.log('Already mapped:');
      allUniqueAccounts
        .filter((acc) => mappedAccountNames.has(acc))
        .forEach((account) => {
          console.log(`  ✓ ${account}`);
        });
      console.log('');
    }

    if (accountsToMap.length > 0) {
      console.log('Unmapped accounts:');
      accountsToMap.forEach((account, index) => {
        console.log(`  ${index + 1}. ${account}`);
      });
    }
  }

  // If no accounts to map, we're done
  if (accountsToMap.length === 0) {
    console.log('\n✅ All accounts are already mapped!');
    console.log('\n🎉 You can now import transactions with:');
    console.log('   ws-actual import');
    return;
  }

  // Connect to ActualBudget to map accounts
  console.log('\n🔗 Connecting to ActualBudget for account mapping...');
  const client = await createClient({
    serverUrl: serverUrl,
    password: password,
    budgetId: selectedSyncId,
    verbose: verbose
  });

  try {
    console.log('✅ Connected\n');

    // Prompt for mapping each account
    let mappedCount = 0;
    for (const wsAccount of accountsToMap) {
      console.log(`\n🏦 WealthSimple Account: "${wsAccount}"`);

      const resolvedMapping = await promptForAccountMapping(wsAccount, client, fullConfig, rl);

      if (resolvedMapping) {
        mappedCount++;
      }
    }

    // Summary
    console.log('\n\n✨ Complete!\n');
    console.log('─'.repeat(50));
    console.log('\n📊 Summary:');

    const totalMappedAccounts = (fullConfig.accounts || []).length;
    console.log(`   Total accounts mapped: ${totalMappedAccounts}`);
    console.log(`   Accounts mapped in this session: ${mappedCount}`);

    const unmappedCount = allUniqueAccounts.length - totalMappedAccounts;
    if (unmappedCount > 0) {
      console.log(`\n⚠️  ${unmappedCount} account(s) are still unmapped.`);
      console.log('   Transactions from unmapped accounts will be skipped during import.');
    }

    console.log('\n🎉 You can now import transactions with:');
    console.log('   ws-actual import');
  } finally {
    await client.shutdown();
  }
}

/**
 * Setup accounts only - skip ActualBudget configuration
 * @param {Object} options CLI options
 * @returns {Promise<void>}
 */
export async function setupAccounts(options = {}) {
  const rl = createReadlineInterface();

  try {
    console.log('🚀 WealthSimple Account Mapping\n');
    console.log(`${'─'.repeat(50)}\n`);

    await performAccountMapping(
      {
        mapAllAccounts: options.all || false,
        verbose: options.verbose || false,
        remoteBrowserUrl: options.remoteBrowserUrl,
        config: options.config
      },
      rl
    );
  } catch (error) {
    console.error('\n❌ Account mapping failed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    rl.close();
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
      'Would you like to automatically map WealthSimple accounts to ActualBudget accounts? (Y/n/all): '
    );

    const response = shouldMapAccounts.toLowerCase().trim();

    if (response === 'n' || response === 'no') {
      console.log('\n⏭️  Skipping automatic account mapping.');
      console.log('\nSetup complete! You can now import transactions with:');
      console.log('  ws-actual import');
      console.log(
        '\nNote: You will need to manually configure account mappings in config.toml before importing.'
      );
      return;
    }

    const mapAllAccounts = response === 'all';

    // Step 3: Perform account mapping
    await performAccountMapping(
      {
        mapAllAccounts,
        verbose: options.verbose,
        remoteBrowserUrl: options.remoteBrowserUrl,
        config: options.config
      },
      rl
    );

    // Add server and budget info to output
    console.log('\n📋 Configuration:');
    console.log(`   ActualBudget Server: ${serverUrl}`);
    console.log(`   Budget: ${selectedBudget.name}`);
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
  setup,
  setupAccounts
};
