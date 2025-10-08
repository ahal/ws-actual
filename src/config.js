import { readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { xdgConfig } from 'xdg-basedir';
import { homedir } from 'os';
import { existsSync } from 'fs';
import toml from 'toml';
import { createReadlineInterface, askPassword } from './util/prompt-helpers.js';
import {
  getStoredPassword,
  storePassword as storePasswordInKeyring,
  deleteStoredPassword
} from './util/keyring-helpers.js';

// Re-export for backward compatibility
export { storePassword } from './util/keyring-helpers.js';

export function getConfigDir() {
  if (xdgConfig) {
    return join(xdgConfig, 'ws-actual');
  }

  const platform = process.platform;
  const home = homedir();

  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'ws-actual');
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'ws-actual');
    default:
      return join(home, '.config', 'ws-actual');
  }
}

export async function loadConfig(customPath = null) {
  const configPath = customPath || join(getConfigDir(), 'config.toml');

  try {
    if (!existsSync(configPath)) {
      if (customPath) {
        console.warn(`Config file not found: ${customPath}. Using default config.`);
      }
      return getDefaultConfig();
    }

    const content = await readFile(configPath, 'utf-8');
    const config = toml.parse(content);

    if (!config.accounts) {
      config.accounts = [];
    } else if (!Array.isArray(config.accounts)) {
      config.accounts = [];
    }

    return config;
  } catch (error) {
    console.warn(`Could not load configuration from ${configPath}:`, error.message);
    return getDefaultConfig();
  }
}

export function getDefaultConfig() {
  return {
    actualServer: {
      url: null,
      syncId: null
    },
    accounts: []
  };
}

export async function saveConfig(config, customPath = null) {
  const configPath = customPath || join(getConfigDir(), 'config.toml');
  const configDir = customPath
    ? configPath.substring(0, configPath.lastIndexOf('/'))
    : getConfigDir();

  try {
    await mkdir(configDir, { recursive: true });

    let tomlContent = '';

    if (config.actualServer) {
      tomlContent += '[actualServer]\n';
      if (config.actualServer.url) {
        tomlContent += `url = "${config.actualServer.url}"\n`;
      }
      if (config.actualServer.syncId) {
        tomlContent += `syncId = "${config.actualServer.syncId}"\n`;
      }
      tomlContent += '\n';
    }

    if (config.accounts && config.accounts.length > 0) {
      for (const account of config.accounts) {
        tomlContent += '[[accounts]]\n';
        if (account.wsAccountName) {
          tomlContent += `wsAccountName = "${account.wsAccountName.replace(/"/g, '\\"')}"\n`;
        }
        tomlContent += `actualAccountId = "${account.actualAccountId}"\n`;
        tomlContent += '\n';
      }
    }

    await writeFile(configPath, tomlContent);
    console.log(`Configuration saved to ${configPath}`);
  } catch (error) {
    throw new Error(`Failed to save configuration: ${error.message}`);
  }
}

export function resolveAccount(wsAccountName, config) {
  if (!config || !config.accounts || !Array.isArray(config.accounts)) {
    return null;
  }

  for (const account of config.accounts) {
    if (!account.wsAccountName || !account.actualAccountId) {
      continue;
    }

    const pattern = account.wsAccountName;

    // Detect if pattern contains regex special characters
    const regexChars = /[.*+?^${}()|[\]\\]/;
    const isRegex = regexChars.test(pattern);

    if (isRegex) {
      // Try regex match
      try {
        const regex = new RegExp(`^${pattern}$`, 'i');
        if (regex.test(wsAccountName)) {
          return {
            accountId: account.actualAccountId,
            accountName: wsAccountName,
            needsLookup: false,
            matchType: 'regex',
            matchedPattern: pattern
          };
        }
      } catch (error) {
        // Invalid regex pattern, skip
        continue;
      }
    } else {
      // Exact match (case-insensitive)
      if (pattern.toLowerCase() === wsAccountName.toLowerCase()) {
        return {
          accountId: account.actualAccountId,
          accountName: wsAccountName,
          needsLookup: false,
          matchType: 'exact',
          matchedPattern: pattern
        };
      }
    }
  }

  return null;
}

export async function getConfig(options = {}, requirePassword = true) {
  const tomlConfig = await loadConfig(options.config);

  const serverUrl = options.serverUrl || tomlConfig.actualServer?.url;

  const config = {
    serverUrl: serverUrl,
    budgetId: options.syncId || tomlConfig.actualServer?.syncId,
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
    password: null,
    configPath: options.config
  };

  if (requirePassword && config.serverUrl) {
    if (options.password) {
      config.password = options.password;
    } else {
      const storedPassword = await getStoredPassword(config.serverUrl);
      if (storedPassword) {
        config.password = storedPassword;
        if (config.verbose) {
          console.log('Using stored password from keyring');
        }
      } else {
        const rl = createReadlineInterface();
        try {
          config.password = await askPassword(
            rl,
            `Enter your ActualBudget password for ${config.serverUrl}: `
          );

          if (config.password) {
            const shouldStore = await new Promise((resolve) => {
              rl.question('💾 Save password to keyring? (Y/n): ', (answer) => {
                resolve(answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no');
              });
            });

            if (shouldStore) {
              const stored = await storePasswordInKeyring(config.serverUrl, config.password);
              if (stored) {
                console.log('✅ Password saved to keyring');
              } else {
                console.log('⚠️  Failed to save password to keyring');
              }
            }
          }
        } finally {
          rl.close();
        }
      }
    }
  }

  return config;
}

export function validateConfig(config) {
  const errors = [];

  if (!config.serverUrl) {
    errors.push('Server URL is required');
  }

  if (!config.password) {
    errors.push('Password is required');
  }

  if (!config.budgetId) {
    errors.push('Budget Sync ID is required');
  }

  if (errors.length > 0) {
    let errorMessage = 'ActualBudget is not configured.\n\n';
    errorMessage += '🔐 Please run the login command first:\n';
    errorMessage += '   ws-actual login\n\n';
    errorMessage += 'This will:\n';
    errorMessage += '  • Connect to your ActualBudget server\n';
    errorMessage += '  • Select your budget\n';
    errorMessage += '  • Save configuration for future imports\n\n';
    errorMessage += 'Alternatively, you can:\n';
    errorMessage += '  • Use CLI options: --server-url <url> --sync-id <id>\n';
    errorMessage += '  • Edit config file manually at: ~/.config/ws-actual/config.toml\n';

    throw new Error(errorMessage);
  }
}

export async function clearPassword(serverUrl) {
  return await deleteStoredPassword(serverUrl);
}

export default {
  getConfig,
  validateConfig,
  loadConfig,
  saveConfig,
  resolveAccount,
  getConfigDir,
  getDefaultConfig,
  clearPassword,
  storePassword: storePasswordInKeyring
};
