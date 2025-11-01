/**
 * DOM-structure-based balance scraper that works without hardcoded account names
 */

export async function scrapeAccountBalancesV2(context, verbose = false) {
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract account balances from the page using DOM structure
    const balances = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const accounts = [];

      // Strategy 1: Find individual account buttons (sc-ecac9ab9-0 ga-drJI)
      // These are the actual account items, not group headers
      const accountButtons = Array.from(document.querySelectorAll('button[class*="sc-ecac9ab9-0"][class*="ga-drJI"]'));

      accountButtons.forEach(button => {
        const text = button.textContent || '';

        // Skip promotional/navigation buttons
        if (text.includes('Open') || text.includes('Refer') || text.includes('Get a') ||
            text.includes('Choose') || text.includes('all time') || text.length < 5) {
          return;
        }

        // Parse account name and balance from button text
        const entries = parseAccountEntries(text);
        entries.forEach(entry => {
          if (entry.name && entry.balance >= 0 && entry.name.length > 1 && entry.name.length < 50) {
            accounts.push(entry);
          }
        });
      });

      // Strategy 2: Scan full page text for accounts not captured by buttons
      // This catches accounts like TFSA, RESP that may not have button elements
      const pageText = document.body.textContent || '';
      const accountTypes = ['TFSA', 'RRSP', 'RESP', 'FHSA', 'Chequing', 'Savings'];

      accountTypes.forEach(type => {
        // Pattern: AccountType (possibly with prefix like "Joint") followed by $amount
        const regex = new RegExp(`([A-Za-z\\s]*${type}[A-Za-z\\s]*)\\s*\\$([\\d,]+\\.\\d{2})`, 'gi');
        let match;

        while ((match = regex.exec(pageText)) !== null) {
          const name = match[1].trim();
          const balance = parseFloat(match[2].replace(/,/g, ''));

          // Clean up the name
          let cleanedName = name
            .replace(/all\s+time/gi, '')
            .replace(/Group\s+view/gi, '')
            .replace(/Accounts/gi, '')
            .replace(/\d+\s+accounts?/gi, '')
            .trim();

          // Remove duplicate words (e.g., "TFSATFSA" -> "TFSA", "RESPRESP" -> "RESP")
          const words = cleanedName.split(/\s+/);
          const uniqueWords = [];
          for (let i = 0; i < words.length; i++) {
            // Check if this word appears consecutively in the string
            if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
              uniqueWords.push(words[i]);
            }
          }

          // Also check for concatenated duplicates like "TFSATFSA"
          cleanedName = uniqueWords.join(' ');
          ['TFSA', 'RRSP', 'RESP', 'FHSA'].forEach(accountType => {
            const duplicated = accountType + accountType;
            const regex = new RegExp(duplicated, 'gi');
            cleanedName = cleanedName.replace(regex, accountType);
          });

          if (cleanedName.length >= 2 && cleanedName.length <= 50 && !isNaN(balance)) {
            // Check if we already have this account
            const normalizedName = cleanedName.toLowerCase();
            const exists = accounts.some(acc => acc.name.toLowerCase() === normalizedName);

            if (!exists) {
              accounts.push({ name: cleanedName, balance });
            }
          }
        }
      });

      // Helper function to parse account entries from text
      function parseAccountEntries(text) {
        const results = [];

        // Split by dollar signs to find potential account-balance pairs
        const parts = text.split('$').filter(p => p.trim().length > 0);

        for (let i = 0; i < parts.length - 1; i++) {
          const beforeDollar = parts[i];
          const afterDollar = parts[i + 1];

          // Extract account name from the part before $ (last word(s))
          // Remove known noise patterns
          let accountName = beforeDollar
            .replace(/\d+\s+accounts?/gi, '') // Remove "2 accounts"
            .replace(/[+−-]\d+\.?\d*%/g, '') // Remove percentages
            .replace(/all\s+time/gi, '') // Remove "all time"
            .replace(/Group\s+view/gi, '') // Remove "Group view"
            .replace(/Accounts/gi, '') // Remove "Accounts" header
            .trim();

          // Take the last meaningful words as account name
          const words = accountName.split(/\s+/).filter(w => w.length > 0);
          if (words.length > 0) {
            // Take up to last 3 words as account name
            accountName = words.slice(-Math.min(3, words.length)).join(' ');
          }

          // Extract balance from the part after $ (first number)
          const balanceMatch = afterDollar.match(/^([\d,]+\.?\d{0,2})/);
          if (balanceMatch) {
            const balance = parseFloat(balanceMatch[1].replace(/,/g, ''));

            if (!isNaN(balance) && balance >= 0 && accountName) {
              // Skip if account name is too short, too long, or contains weird characters
              if (accountName.length >= 2 &&
                  accountName.length <= 50 &&
                  !/^[\d\s]+$/.test(accountName) && // Not just numbers
                  !/<|>/.test(accountName)) { // No HTML
                results.push({ name: accountName.trim(), balance });
              }
            }
          }
        }

        return results;
      }

      // Deduplicate - keep highest balance for each unique name
      const accountMap = new Map();
      accounts.forEach(acc => {
        const normalizedName = acc.name.toLowerCase();
        if (!accountMap.has(normalizedName) || accountMap.get(normalizedName).balance < acc.balance) {
          accountMap.set(normalizedName, acc);
        }
      });

      return Array.from(accountMap.values());
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
