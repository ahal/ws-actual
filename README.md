# WealthSimple to ActualBudget Importer

A Node.js CLI tool to import WealthSimple CSV exports into ActualBudget.

## Features

- Import WealthSimple transactions from CSV exports
- Account mapping via configuration file
- Transaction deduplication
- Dry-run mode for previewing imports
- Account discovery and configuration helpers
- Support for multiple currencies
- Detailed import statistics and logging
- Only imports transactions with configured account mappings

## Installation

### Using npx (recommended)
```bash
npx ws-actual import transactions.csv
```

### Global installation
```bash
npm install -g ws-actual
ws-actual import transactions.csv
```

### Local development
```bash
git clone <repository>
cd ws-actual
npm install
npm link
```

## Quick Start

1. Export your transactions from WealthSimple as CSV
2. Set up your ActualBudget connection:
   ```bash
   cp config.toml.example ~/.config/ws-actual/config.toml
   # Edit config.toml with your ActualBudget server URL and sync ID
   # Password will be prompted and stored securely in your system keyring
   ```
3. Import transactions:
   ```bash
   npx ws-actual import wealthsimple-export.csv --dry-run
   # Remove --dry-run when ready to import
   ```

## Configuration

### TOML Configuration File

Create `~/.config/ws-actual/config.toml` from `config.toml.example`:

```toml
[actualServer]
url = "http://localhost:5006"
syncId = "your-sync-id-here"

[[accounts]]
wsPattern = "WealthSimple Cash"
actualAccountId = "uuid-from-actualbudget"
```

### Password Management

Passwords are **never stored in configuration files**. Instead:
- 🔐 **Prompted at runtime** when needed
- 💾 **Securely stored** in your system keyring (optional)
- 🔄 **Automatically retrieved** from keyring for subsequent runs

### Account Mapping

Transactions are only imported if the WealthSimple account name has a mapping configured in the `[accounts]` section of your config.toml. Unmapped accounts will be skipped.

### Data Storage

The tool stores ActualBudget data cache in the XDG data directory: `$XDG_DATA_HOME/ws-actual/` (typically `~/.local/share/ws-actual/`).

List available ActualBudget accounts:
```bash
npx ws-actual accounts list
```

Create account mappings interactively:
```bash
npx ws-actual accounts generate-config
```

Example configuration:
```toml
[actualServer]
url = "http://localhost:5006"
syncId = "your-sync-id"

[[accounts]]
wsPattern = "WealthSimple Cash"
actualAccountId = "uuid-here"

[[accounts]]
wsPattern = ".*Cash.*"
actualAccountId = "uuid-here"

[[accounts]]
wsPattern = ".*TFSA.*|.*RRSP.*"
actualAccountId = "uuid-here"

[[accounts]]
wsPattern = "Chequing( • Solo)?"
actualAccountId = "uuid-here"
```

**Account Matching Logic:**
- Each `[[accounts]]` entry defines a mapping with `wsPattern` and `actualAccountId`
- `wsPattern` values are treated as patterns (case-insensitive)
- **Plain strings** like `"WealthSimple Cash"` are automatically treated as exact matches
- **Regex patterns** like `".*Cash.*"` can be used for flexible matching
- First matching pattern wins

**Pattern Examples:**
- `"WealthSimple Cash"` - Exact match only (auto-anchored as `^WealthSimple Cash$`)
- `".*Cash.*"` - Matches any account containing "Cash"
- `".*TFSA.*|.*RRSP.*"` - Matches accounts containing "TFSA" or "RRSP"
- `"^WealthSimple"` - Matches accounts starting with "WealthSimple"
- `"Savings?$"` - Matches accounts ending with "Saving" or "Savings"

## CLI Usage

### Import Transactions

```bash
npx ws-actual import <csv-file> [options]

Options:
  --sync-id <id>        ActualBudget sync ID (from Settings → Advanced → Sync ID)
  --server-url <url>    ActualBudget server URL
  --password <pwd>      ActualBudget password (will prompt if not provided)
  --config <path>      Custom config.toml file (overrides default location)
  --dry-run            Preview without importing
  --verbose            Show detailed output
```

### Account Management

List ActualBudget accounts:
```bash
npx ws-actual accounts list [--json]
```

Generate account configuration (interactive):
```bash
npx ws-actual accounts generate-config
```

Validate account mappings:
```bash
npx ws-actual accounts validate [--verbose]
```

Reset all local data (cache + stored passwords):
```bash
npx ws-actual reset [--server-url <url>]
```

## CSV Format

The tool expects WealthSimple CSV exports with these columns:
- `account` - Account name
- `status` - Transaction status
- `date` - Transaction date
- `submitted` - Submission date
- `filled` - Completion date
- `amount` - Transaction amount
- `amountCurrency` - Currency code
- `type` - Transaction type
- `description` - Transaction description
- `transactionId` - Unique transaction ID
- Additional columns are preserved

## Transaction Mapping

### Amount Handling
- Amounts are converted to cents for ActualBudget
- Negative amounts for withdrawals/debits
- Positive amounts for deposits/credits

### Date Processing
- Uses `filled` date if available, otherwise `date`
- Converts to YYYY-MM-DD format

### Transaction Types
The following WealthSimple transaction types are automatically detected:
- Deposits
- Withdrawals
- Transfers (in/out)
- Payments
- Purchases
- Interest
- Dividends
- Fees
- Refunds

## Development

### Project Structure
```
ws-actual/
├── src/
│   ├── index.js          # Main entry point
│   ├── csv-parser.js     # CSV parsing logic
│   ├── actual-client.js  # ActualBudget API wrapper
│   ├── transformer.js    # Data transformation
│   └── config.js         # Configuration management
├── bin/
│   └── cli.js           # CLI executable
├── test/
│   └── *.test.js        # Test files
└── package.json
```

### Running Tests
```bash
npm test
npm run test:coverage
```

### Linting and Formatting
```bash
npm run lint
npm run format
```

## Troubleshooting

### Connection Issues
- Verify ActualBudget server is running
- Check server URL and password
- Ensure budget ID is correct
- Try `npx ws-actual reset` to clear cache and start fresh

### Import Failures
- Run with `--verbose` for detailed logs
- Check CSV format matches expected columns
- Verify account mappings are correct

### Duplicate Transactions
- Tool checks transaction IDs to prevent duplicates
- Use unique `transactionId` from WealthSimple

### Database/Migration Errors
- If you see "out-of-sync-migrations" or similar errors
- Run `npx ws-actual reset` to clear local cache and stored passwords
- This forces a fresh connection and re-download of budget data

## License

MIT