# R SQL Editor

Enhanced SQL editing experience for SQL strings in R scripts with DuckDB integration.

## Features

### 🎯 Intelligent SQL Autocomplete in R Strings

Write SQL inside R strings with full IDE support:

```r
library(DBI)
con <- dbConnect(duckdb::duckdb(), "my_database.duckdb")

# Get autocomplete for SQL functions, tables, and columns!
result <- dbGetQuery(con, "
  SELECT
    customer_id,
    SUM(amount) as total,
    COUNT(*) as order_count
  FROM orders
  WHERE date > CURRENT_DATE - INTERVAL '30 days'
  GROUP BY customer_id
  ORDER BY total DESC
")
```

### ✨ Key Features

- **DuckDB Function Signatures**: Type a function name and get instant documentation with examples
  - Aggregate functions: `COUNT()`, `SUM()`, `AVG()`, `STRING_AGG()`, etc.
  - String functions: `CONCAT()`, `UPPER()`, `LOWER()`, `REGEXP_MATCHES()`, etc.
  - Date/Time functions: `NOW()`, `DATE_TRUNC()`, `EXTRACT()`, `STRFTIME()`, etc.
  - Window functions: `ROW_NUMBER()`, `RANK()`, `LAG()`, `LEAD()`, etc.
  - And many more!

- **Schema-Aware Completions**: Connect to your DuckDB database for:
  - Table name suggestions
  - Column name suggestions with type information
  - Smart `table.column` completion

- **Glue Package Integration**: Full support for `glue` and `glue_sql`!
  - SQL autocomplete works in `glue()`, `glue_sql()`, `glue_data()` strings
  - Automatically detects `{...}` R interpolation blocks
  - SQL completions outside `{}`, R completions inside `{}`
  - Smart validation that accounts for interpolated expressions

- **SQL Syntax Validation**: Real-time diagnostics for common SQL errors
  - Unmatched parentheses
  - Missing clauses
  - Common typos

- **Inline Query Execution**: Execute queries directly from your R file and view results

## Installation

### Prerequisites

- Visual Studio Code or Positron
- Node.js (v16 or higher)

### Build from Source

```bash
npm install
npm run compile
```

### Package Extension

```bash
npm run package
```

Then install the `.vsix` file in VSCode:
1. Open VSCode
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Click the "..." menu
4. Select "Install from VSIX..."
5. Choose the generated `.vsix` file

## Usage

### Connecting to a Database

1. Open an R file with SQL strings
2. Run command: **R SQL: Connect to DuckDB Database** (Cmd+Shift+P / Ctrl+Shift+P)
3. Select your `.duckdb`, `.db`, or `.ddb` file

Or configure in settings:

```json
{
  "rsqledit.duckdbPath": "/path/to/your/database.duckdb"
}
```

### Getting Autocomplete

The extension automatically detects SQL strings in these functions:
- `DBI::dbExecute()`
- `DBI::dbGetQuery()`
- `DBI::dbSendQuery()`
- `DBI::dbSendStatement()`
- `dbplyr::sql()`
- `glue::glue()`, `glue::glue_sql()`
- `glue::glue_data()`, `glue::glue_data_sql()`
- And their non-namespaced versions

Just start typing and autocomplete will appear!

### Example Workflow

```r
library(DBI)
library(duckdb)

# Connect to database
con <- dbConnect(duckdb(), "sales.duckdb")

# Create some tables
dbExecute(con, "
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name VARCHAR,
    email VARCHAR,
    created_at TIMESTAMP
  )
")

# Now get autocomplete for tables and columns!
customers <- dbGetQuery(con, "
  SELECT
    id,              -- Autocomplete suggests: id, name, email, created_at
    name,
    email,
    DATE_TRUNC(      -- Function signature and examples appear!
      'day',
      created_at
    ) as signup_date
  FROM customers   -- Table name autocompleted!
  WHERE created_at > CURRENT_DATE - INTERVAL '1 month'
")

# Works great with glue too!
table_name <- "customers"
min_date <- "2024-01-01"

customers <- dbGetQuery(con, glue_sql("
  SELECT
    customer_id,
    name,
    DATE_TRUNC('month', created_at) as signup_month
  FROM {`table_name`}        -- R variable interpolation
  WHERE created_at > {min_date}
  ORDER BY created_at DESC   -- Full SQL autocomplete!
", .con = con))
```

### Commands

- **R SQL: Connect to DuckDB Database**: Connect to a database file
- **R SQL: Refresh Database Schema**: Refresh table/column information
- **R SQL: Execute Query at Cursor**: Run the SQL query under cursor

## Configuration

```json
{
  // Path to DuckDB database (auto-connects on startup)
  "rsqledit.duckdbPath": "",

  // Enable SQL autocomplete in R strings
  "rsqledit.enableAutoComplete": true,

  // Enable SQL syntax validation
  "rsqledit.enableDiagnostics": true
}
```

## Positron Compatibility

This extension is fully compatible with Positron IDE. All features work identically in both VSCode and Positron.

## Supported Functions

The extension recognizes SQL strings in:

**DBI Package:**
- `dbExecute()`
- `dbGetQuery()`
- `dbSendQuery()`
- `dbSendStatement()`

**dbplyr Package:**
- `sql()`

**glue Package:**
- `glue()`
- `glue_sql()`
- `glue_data()`
- `glue_data_sql()`

All namespaced versions work too (e.g., `DBI::dbGetQuery()`, `glue::glue_sql()`)

## Tips

1. **Connect Early**: Connect to your database at the start of your session for best autocomplete experience
2. **Use Dot Notation**: Type `tablename.` to get column-specific completions
3. **Multi-line Strings**: The extension works great with multi-line SQL strings
4. **Function Help**: Hover over any SQL function to see documentation and examples
5. **Glue Integration**: Use `glue_sql()` instead of `glue()` for safer SQL interpolation with proper quoting
6. **Inside `{}`**: When cursor is inside `{...}` blocks, you get R autocomplete; outside you get SQL autocomplete

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Acknowledgments

Built with love for the R and DuckDB communities. Special thanks to the developers of:
- DuckDB
- DBI package
- dbplyr and duckplyr
