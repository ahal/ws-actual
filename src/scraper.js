import { chromium } from 'playwright';
import { processTransactionDetails, parseTransaction } from './parser.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expandTransactions(page, verbose = false) {
  const expandedCount = await page.evaluate(() => {
    /* eslint-disable no-undef */
    const elements = document.querySelectorAll('[role="button"]');
    const headerRegex = /-header$/;
    let count = 0;

    elements.forEach((element) => {
      if (headerRegex.test(element.id)) {
        if (element instanceof HTMLElement) {
          if (element.getAttribute('aria-expanded') === 'false') {
            element.click();
            count++;
          }
        }
      }
    });

    return count;
  });

  if (verbose) {
    console.log(`Clicked ${expandedCount} transaction headers to expand them`);
  }

  await wait(3000);

  const regionCount = await page.evaluate(() => {
    /* eslint-disable no-undef */
    return document.querySelectorAll('[role="region"]').length;
  });

  if (verbose) {
    console.log(`Found ${regionCount} expanded regions after waiting`);
  }

  return { expandedCount, regionCount };
}

async function loadAllTransactions(page, verbose = false) {
  let clickCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Scroll to bottom to make "Load More" button visible if it exists
    await page.evaluate(() => {
      /* eslint-disable no-undef */
      window.scrollTo(0, document.body.scrollHeight);
    });
    await wait(1000); // Wait for button to appear after scroll

    // Count transactions before clicking
    const transactionCountBefore = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = document.querySelectorAll('button[role="button"]');
      let count = 0;
      buttons.forEach((button) => {
        if (button.id && button.id.endsWith('-header')) {
          count++;
        }
      });
      return count;
    });

    const buttonClicked = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = Array.from(document.querySelectorAll('button'));
      const loadMoreButton = buttons.find((button) => {
        const text = button.textContent?.toLowerCase() || '';
        return text.includes('load more') || text.includes('show more');
      });

      if (loadMoreButton && !loadMoreButton.disabled) {
        loadMoreButton.click();
        return true;
      }
      return false;
    });

    if (!buttonClicked) {
      if (verbose) {
        console.log('No more transactions to load');
      }
      break;
    }

    clickCount++;

    // Wait for new content to load (wait for transaction count to increase)
    // Try for up to 10 seconds
    let newTransactionsLoaded = false;
    for (let i = 0; i < 20; i++) {
      await wait(500);

      const transactionCountAfter = await page.evaluate(() => {
        /* eslint-disable no-undef */
        const buttons = document.querySelectorAll('button[role="button"]');
        let count = 0;
        buttons.forEach((button) => {
          if (button.id && button.id.endsWith('-header')) {
            count++;
          }
        });
        return count;
      });

      if (transactionCountAfter > transactionCountBefore) {
        newTransactionsLoaded = true;
        if (verbose) {
          console.log(
            `Clicked "Load More" (${clickCount} times) - loaded ${transactionCountAfter - transactionCountBefore} more transactions (total: ${transactionCountAfter})`
          );
        }
        break;
      }
    }

    if (!newTransactionsLoaded && verbose) {
      console.log('Warning: Clicked "Load More" but no new transactions appeared after 10 seconds');
    }

    // Small additional wait before next iteration
    await wait(500);
  }

  return clickCount;
}

async function waitForActivityPage(page, timeoutMs = 300000) {
  console.log('Waiting for activity page to load (timeout: 5 minutes)...');
  console.log('Please log in to WealthSimple if prompted.');
  console.log('');

  const startTime = Date.now();

  try {
    if (page.isClosed()) {
      throw new Error('Page was closed before waiting for activity');
    }

    await page.waitForFunction(
      () => {
        /* eslint-disable no-undef */
        const buttons = document.querySelectorAll('button[role="button"]');
        for (const button of buttons) {
          if (button.id && button.id.endsWith('-header') && button.getAttribute('aria-controls')) {
            return true;
          }
        }
        return false;
      },
      { timeout: timeoutMs, polling: 1000 }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Activity page detected after ${elapsed} seconds`);
    return true;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (error.message.includes('closed')) {
      throw error;
    }

    console.error(`Timeout after ${elapsed} seconds waiting for activity page.`);
    console.error('Please ensure you are logged in and on the activity page.');
    console.error('Error details:', error.message);
    return false;
  }
}

async function getBrowserInfo() {
  const { xdgData } = await import('xdg-basedir');
  const { join } = await import('path');
  const userDataDir = join(xdgData, 'ws-actual', 'browser-chromium');

  return { launcher: chromium, name: 'Chromium', userDataDir };
}

/**
 * Extract account balances from the WealthSimple home page
 * @param {Object} context - Browser context (from Playwright)
 * @param {boolean} verbose - Log detailed progress
 * @returns {Promise<Array>} - Array of account balances {name, balance}
 */
export async function scrapeAccountBalances(context, verbose = false) {
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  try {
    if (verbose) {
      console.log('\nNavigating to WealthSimple home page to fetch balances...');
    }

    await page.goto('https://my.wealthsimple.com/app/home', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Wait for accounts to load
    await wait(3000);

    // Extract account balances from the page
    const balances = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const accounts = [];
      const processedElements = new Set();

      // Account name patterns to search for
      // Order matters - more specific patterns first
      const accountNamePatterns = [
        { pattern: /Spousal\s+RRSP/i, name: 'Spousal RRSP' },
        { pattern: /Joint\s+RESP/i, name: 'Joint RESP' },
        { pattern: /Joint.*Chequing|Chequing.*Joint/i, name: 'Joint' },
        { pattern: /Solo|Chequing.*Solo/i, name: 'Solo' },
        { pattern: /^TFSA(?:\s|$)/i, name: 'TFSA' },
        { pattern: /^RRSP(?:\s|$)/i, name: 'RRSP' },
        { pattern: /^FHSA(?:\s|$)/i, name: 'FHSA' },
        { pattern: /^Cash(?:\s|$)/i, name: 'Cash' },
        { pattern: /Personal.*Investment/i, name: 'Personal Investment' },
        { pattern: /Non-registered/i, name: 'Non-registered' },
        { pattern: /Chequing/i, name: 'Chequing' },
        { pattern: /Savings/i, name: 'Savings' }
      ];

      // Helper to extract clean account name
      function extractAccountName(text, matchedPattern) {
        // Try to extract just the account type from potentially longer text
        const cleanText = text.trim();

        // Remove common noise patterns
        let name = cleanText
          .replace(/\$[\d,]+\.?\d{0,2}/g, '') // Remove dollar amounts
          .replace(/[+−-]\d+\.?\d*%/g, '') // Remove percentages
          .replace(/\d+\s+accounts?/gi, '') // Remove "2 accounts" type text
          .replace(/all\s+time/gi, '') // Remove "all time"
          .trim();

        // If we have multiple lines, take the first substantial one
        const lines = name.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
          name = lines[0];
        }

        // If name is still messy or too long, extract just the pattern
        if (name.length > 50 || /[\$\d]{5,}/.test(name)) {
          const match = cleanText.match(matchedPattern.pattern);
          if (match) {
            return matchedPattern.name;
          }
        }

        // Final cleanup - if name still contains the account type pattern, use just that
        if (matchedPattern.pattern.test(name)) {
          // Extract just the account type word
          const typeMatch = name.match(matchedPattern.pattern);
          if (typeMatch && typeMatch[0]) {
            // For patterns like "TFSA", "RRSP", return just that
            // For patterns like "Chequing", include any descriptive words before it
            const beforePattern = name.substring(0, name.indexOf(typeMatch[0])).trim();
            if (beforePattern && beforePattern.split(/\s+/).length <= 2) {
              return `${beforePattern} ${typeMatch[0]}`.trim();
            }
            return typeMatch[0].trim();
          }
        }

        return name;
      }

      // Helper to find balance in element tree
      function findBalanceInTree(element, maxDepth = 4) {
        const visited = new Set();
        const toCheck = [{ el: element, depth: 0 }];

        while (toCheck.length > 0) {
          const { el, depth } = toCheck.shift();

          if (!el || visited.has(el) || depth > maxDepth) {
continue;
}
          visited.add(el);

          const text = el.textContent || '';

          // Look for dollar amounts - match multiple to find the largest (likely the total)
          const dollarMatches = text.match(/\$[\d,]+\.?\d{0,2}/g);
          if (dollarMatches && el.children.length < 10) {
            // Parse all amounts and use the largest one (usually the total balance)
            const amounts = dollarMatches
              .map(match => {
                const cleaned = match.replace(/[$,]/g, '');
                return parseFloat(cleaned);
              })
              .filter(amt => !isNaN(amt) && amt > 0);

            if (amounts.length > 0) {
              // Return the largest amount (usually the main balance, not available balance)
              return Math.max(...amounts);
            }
          }

          // Check parent and siblings
          if (el.parentElement && depth < maxDepth) {
            toCheck.push({ el: el.parentElement, depth: depth + 1 });
            const siblings = Array.from(el.parentElement.children);
            siblings.forEach(sibling => {
              if (sibling !== el) {
                toCheck.push({ el: sibling, depth: depth + 1 });
              }
            });
          }
        }

        return null;
      }

      // Strategy 1: Look for elements with account name patterns
      const allElements = document.querySelectorAll('*');

      for (const element of allElements) {
        if (processedElements.has(element)) {
continue;
}

        const elementText = element.textContent || '';

        // Check each account pattern
        for (const accountPattern of accountNamePatterns) {
          if (!accountPattern.pattern.test(elementText)) {
continue;
}

          // Found potential account name element
          const accountName = extractAccountName(elementText, accountPattern);

          // Skip if this text is too long (likely contains more than just account name)
          if (accountName.length > 100) {
continue;
}

          // Try to find balance near this element
          const balance = findBalanceInTree(element);

          if (balance !== null && balance > 0) {
            // Check for duplicates
            const isDuplicate = accounts.some(
              acc => acc.name === accountName && Math.abs(acc.balance - balance) < 0.01
            );

            if (!isDuplicate) {
              accounts.push({ name: accountName, balance });
              processedElements.add(element);
            }
            break; // Found balance for this element, move to next
          }
        }
      }

      // Strategy 2: Look for data-testid or other semantic attributes
      const semanticSelectors = [
        '[data-testid*="account"]',
        '[data-testid*="balance"]',
        '[aria-label*="account"]',
        'section[class*="account" i]',
        'div[class*="account-card" i]'
      ];

      for (const selector of semanticSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent || '';

            // Check if contains account name
            for (const accountPattern of accountNamePatterns) {
              if (!accountPattern.pattern.test(text)) {
continue;
}

              const accountName = extractAccountName(text, accountPattern);
              const balance = findBalanceInTree(element, 2);

              if (balance !== null && balance > 0) {
                const isDuplicate = accounts.some(
                  acc => acc.name === accountName && Math.abs(acc.balance - balance) < 0.01
                );

                if (!isDuplicate) {
                  accounts.push({ name: accountName, balance });
                }
                break;
              }
            }
          }
        } catch (e) {
          // Invalid selector, skip
        }
      }

      // Deduplicate accounts - keep only the highest balance for each unique account name
      const accountMap = new Map();
      accounts.forEach(acc => {
        // Skip invalid account names
        if (!acc.name || acc.name.length < 2 || acc.name.length > 50) {
          return;
        }

        // Skip names that look like HTML/CSS (contain < or >)
        if (acc.name.includes('<') || acc.name.includes('>') || acc.name.includes('style=')) {
          return;
        }

        // Skip names with concatenated account types (e.g., "RRSPRRSP", "ChequingSoloJoint")
        const accountTypeCount = ['TFSA', 'RRSP', 'Chequing', 'Solo', 'Joint', 'RESP', 'Spousal'].filter(
          type => {
            const regex = new RegExp(type, 'gi');
            const matches = acc.name.match(regex);
            return matches && matches.length > 0;
          }
        ).length;
        if (accountTypeCount > 2) { // Allow 2 for "Joint RESP", "Spousal RRSP"
          return;
        }

        // Skip names that are just numbers or have too many numbers
        if (/^\d+$/.test(acc.name) || (acc.name.match(/\d/g) || []).length > 5) {
          return;
        }

        // Normalize account name for comparison
        const normalizedName = acc.name.trim().toLowerCase();

        // If we've seen this account before, keep the one with the larger balance
        if (accountMap.has(normalizedName)) {
          const existing = accountMap.get(normalizedName);
          if (acc.balance > existing.balance) {
            accountMap.set(normalizedName, acc);
          }
        } else {
          accountMap.set(normalizedName, acc);
        }
      });

      // Convert back to array
      const uniqueAccounts = Array.from(accountMap.values());

      return uniqueAccounts;
    });

    if (verbose) {
      console.log(`Found ${balances.length} account balances:`);
      balances.forEach((acc) => {
        console.log(`  ${acc.name}: $${acc.balance.toFixed(2)}`);
      });
    }

    return balances;
  } catch (error) {
    console.error('Error scraping account balances:', error.message);
    return [];
  }
}

/**
 * Extract all transactions from the WealthSimple activity page
 * @param {Object} options - Scraper options
 * @param {boolean} options.verbose - Log detailed progress
 * @param {string} options.remoteBrowserUrl - Chrome DevTools Protocol URL for remote browser connection
 * @param {boolean} options.keepContextOpen - Keep browser context open after scraping (for balance adjustment)
 * @returns {Promise<Array|Object>} - Array of parsed transactions, or {transactions, context} if keepContextOpen is true
 */
export async function scrapeTransactions({ verbose = false, remoteBrowserUrl = null, keepContextOpen = false }) {
  let context;
  let shouldCloseContext = !keepContextOpen;

  if (remoteBrowserUrl) {
    // Connect to remote browser via Chrome DevTools Protocol
    if (verbose) {
      console.log(`Connecting to remote browser at ${remoteBrowserUrl}...`);
      console.log('');
    }

    const browser = await chromium.connectOverCDP(remoteBrowserUrl);
    context = browser.contexts()[0];
    shouldCloseContext = false; // Don't close remote browser

    if (verbose) {
      console.log('Connected to remote browser');
      console.log('');
    }
  } else {
    // Launch Chromium with persistent profile
    const { userDataDir } = await getBrowserInfo();

    if (verbose) {
      console.log('Launching Chromium with persistent profile...');
      console.log(`Profile directory: ${userDataDir}`);
      console.log('');
    }

    // Use launchPersistentContext to save login session
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false
    });
  }

  try {
    // Get existing page or create new one
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // Set a longer default timeout for all operations
    page.setDefaultTimeout(300000); // 5 minutes

    if (verbose) {
      console.log('Navigating to WealthSimple activity page...');
    }

    // Navigate with longer timeout to allow for login and 2FA
    await page.goto('https://my.wealthsimple.com/app/activity', {
      waitUntil: 'domcontentloaded',
      timeout: 300000 // 5 minutes for navigation (includes login + 2FA)
    });

    // Wait for user to log in and activity page to load
    let pageLoaded = false;
    try {
      pageLoaded = await waitForActivityPage(page, 300000);
    } catch (error) {
      // Check if the page is still open
      if (page.isClosed()) {
        throw new Error('Browser was closed during login');
      }
      throw error;
    }

    if (!pageLoaded) {
      throw new Error(
        'Failed to load activity page - please ensure you are logged in and on the activity page'
      );
    }

    if (verbose) {
      console.log('Activity page detected. Loading all transactions...');
    }

    // Load all transactions
    const clickCount = await loadAllTransactions(page, verbose);

    // Count how many transactions are now visible
    const totalTransactions = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = document.querySelectorAll('button[role="button"]');
      let count = 0;
      buttons.forEach((button) => {
        if (button.id && button.id.endsWith('-header')) {
          count++;
        }
      });
      return count;
    });

    if (verbose) {
      console.log(
        `Loaded all transactions (clicked "Load More" ${clickCount} times, found ${totalTransactions} transactions)`
      );
    } else {
      console.log(`Found ${totalTransactions} transactions`);
    }

    // Expand all collapsed transactions
    if (verbose) {
      console.log('Expanding all transactions...');
    }
    const expansionResult = await expandTransactions(page, verbose);

    if (verbose) {
      console.log(
        `Expansion complete. Clicked: ${expansionResult.expandedCount}, Regions visible: ${expansionResult.regionCount}`
      );
    }

    // Give more time for all expansions to complete
    await wait(2000);

    // Count transaction headers (not regions, since regions only exist when expanded)
    const transactionHeaders = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = document.querySelectorAll('button[role="button"]');
      const headers = [];
      buttons.forEach((button) => {
        if (button.id && button.id.endsWith('-header') && button.getAttribute('aria-controls')) {
          headers.push({
            headerId: button.id,
            regionId: button.getAttribute('aria-controls')
          });
        }
      });
      return headers;
    });

    if (verbose) {
      console.log(`Found ${transactionHeaders.length} transactions. Parsing...`);
    }

    // Extract transaction data using the region IDs
    const rawTransactions = [];
    for (let i = 0; i < transactionHeaders.length; i++) {
      const { headerId, regionId } = transactionHeaders[i];

      // Ensure this specific transaction is expanded by clicking its header
      // This handles cases where aria-expanded="true" but region content hasn't loaded
      await page.evaluate((id) => {
        /* eslint-disable no-undef */
        const header = document.querySelector(`[id="${id}"]`);
        if (header && header.getAttribute('aria-expanded') === 'false') {
          header.click();
        }
      }, headerId);

      // Wait a bit for the expansion to complete
      await wait(100);

      // Use attribute selector since IDs might start with numbers
      const selector = `[id="${regionId}"]`;
      const rawData = await processTransactionDetails(page, selector);
      if (rawData) {
        rawTransactions.push(rawData);
      } else if (verbose && i === 0) {
        console.log(`WARNING: First transaction returned no data. Region ID: ${regionId}`);
      }

      if (verbose && (i + 1) % 10 === 0) {
        console.log(`Parsed ${i + 1}/${transactionHeaders.length} transactions...`);
      }
    }

    if (verbose) {
      console.log(`Extracted ${rawTransactions.length} raw transactions from DOM`);
    }

    // Parse transactions in Node.js context
    if (verbose && rawTransactions.length > 0) {
      console.log('Sample raw transaction data (first transaction):');
      console.log(JSON.stringify(rawTransactions[0], null, 2));
    } else if (rawTransactions.length === 0) {
      console.log('WARNING: No raw transactions were extracted from the DOM!');
    }

    const transactions = rawTransactions.map(parseTransaction).filter(Boolean);

    if (verbose && transactions.length === 0 && rawTransactions.length > 0) {
      console.log(
        'WARNING: Parsing returned 0 transactions from',
        rawTransactions.length,
        'raw transactions'
      );
      console.log('First raw transaction:', JSON.stringify(rawTransactions[0], null, 2));
    }

    if (verbose) {
      console.log(`Successfully parsed ${transactions.length} transactions`);
    }

    if (keepContextOpen) {
      return { transactions, context };
    }
    return transactions;
  } finally {
    if (shouldCloseContext) {
      if (verbose) {
        console.log('\nClosing browser...');
      }
      await context.close();
    } else if (verbose) {
      console.log('\nLeaving browser context open...');
    }
  }
}
