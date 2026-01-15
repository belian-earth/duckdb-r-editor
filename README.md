# DuckDB for R

**DuckDB-focused SQL editor** for R scripts with intelligent autocomplete, schema introspection, and native Positron integration.

This extension is specifically designed for **DuckDB** - providing rich autocomplete for 500+ DuckDB functions, DuckDB-specific syntax support, and seamless integration with DuckDB databases in your R workflow.

## Features

### 🦆 DuckDB-Powered SQL Autocomplete in R Strings

Write DuckDB SQL inside R strings with full IDE support:

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

- **500+ DuckDB Function Signatures**: Type a function name and get instant documentation with examples
  - DuckDB aggregate functions: `COUNT()`, `SUM()`, `AVG()`, `STRING_AGG()`, `APPROX_COUNT_DISTINCT()`, etc.
  - DuckDB string functions: `CONCAT()`, `UPPER()`, `LOWER()`, `REGEXP_MATCHES()`, `LIST_AGGREGATE()`, etc.
  - DuckDB date/time functions: `NOW()`, `DATE_TRUNC()`, `EXTRACT()`, `STRFTIME()`, `MAKE_TIMESTAMP()`, etc.
  - DuckDB window functions: `ROW_NUMBER()`, `RANK()`, `LAG()`, `LEAD()`, `PERCENT_RANK()`, etc.
  - DuckDB-specific features: `UNNEST()`, `LIST_VALUE()`, `STRUCT_PACK()`, and more!

- **DuckDB Schema-Aware Completions**: Connect to your DuckDB database for:
  - Table name suggestions from your DuckDB database
  - Column name suggestions with DuckDB type information
  - Smart `table.column` completion with DuckDB schema introspection

- **Glue Package Integration**: Full support for `glue` and `glue_sql` with DuckDB!
  - DuckDB SQL autocomplete works in `glue()`, `glue_sql()`, `glue_data()` strings
  - Automatically detects `{...}` R interpolation blocks
  - SQL completions outside `{}`, R completions inside `{}`
  - Smart validation that accounts for interpolated expressions

- **DuckDB SQL Syntax Validation**: Real-time diagnostics for common SQL errors
  - Unmatched parentheses
  - Missing clauses
  - Common typos

- **Inline DuckDB Query Execution**: Execute DuckDB queries directly from your R file and view results

## Why DuckDB?

This extension is **exclusively focused on DuckDB** because:
- 🚀 DuckDB is optimized for analytical queries in R workflows
- 📊 Perfect for data analysis with R data frames via `duckplyr` and `dbplyr`
- 🔧 500+ specialized functions for analytics, strings, dates, JSON, and more
- ⚡ Fast and embeddable - no server setup required
- 🎯 Native integration with the R ecosystem

**Note**: While the extension may work with other DBI-compatible databases in Positron (via R session connections), all autocomplete, validation, and documentation features are designed specifically for DuckDB syntax and functions.

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

**In Positron (Recommended):**

Just create a DBI connection in your R console named `con`:

```r
library(DBI)
con <- dbConnect(duckdb::duckdb(), "mydb.duckdb")
```

The extension automatically discovers the connection and schema!

**In VSCode:**

1. Open an R file with DuckDB SQL strings
2. Run command: **DuckDB for R: Connect to DuckDB Database** (Cmd+Shift+P / Ctrl+Shift+P)
3. Select your DuckDB database file (`.duckdb`, `.db`, or `.ddb`)

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

- **DuckDB for R: Connect to DuckDB Database**: Connect to a DuckDB database file
- **DuckDB for R: Refresh DuckDB Schema**: Refresh table/column information from DuckDB
- **DuckDB for R: Execute DuckDB Query at Cursor**: Run the DuckDB query under cursor

## Configuration

```json
{
  // Path to DuckDB database file (auto-connects on startup)
  "rsqledit.duckdbPath": "",

  // Enable DuckDB SQL autocomplete in R strings
  "rsqledit.enableAutoComplete": true,

  // Enable DuckDB SQL syntax validation
  "rsqledit.enableDiagnostics": true
}
```

## Positron Integration ⭐

This extension has **native Positron integration** optimized for DuckDB workflows:

### In Positron Mode:
- 🦆 **Designed for DuckDB** - Primary support and testing focused on DuckDB databases
- 🎯 **Uses your R session's DuckDB connection** - No separate database connection needed
- 🔄 **Auto-discovers DuckDB schema** from your R environment
- 🚀 **Executes DuckDB queries in R console** - Results appear directly in your R session
- 🔥 **No database lock conflicts** - Works with your existing DuckDB connection
- ⚠️ **Limited support for other databases** - While the extension can work with other DBI databases (PostgreSQL, MySQL, SQLite) in Positron, autocomplete functionality is specifically tailored for DuckDB syntax and functions

### In VSCode Mode:
- Direct DuckDB connection via Node.js (DuckDB only)
- Manual DuckDB database connection management
- Results displayed in webview panel

The extension automatically detects which environment you're running in and adapts accordingly!

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

## Known Limitations

### In-Memory Databases

The extension **cannot access in-memory DuckDB databases** created in your R session:

```r
# ❌ Schema autocomplete NOT available for in-memory databases
con <- dbConnect(duckdb::duckdb(), dbdir = ":memory:")
con <- dbConnect(duckdb::duckdb())  # defaults to :memory:
```

**Why?** In-memory databases exist only in the R process's memory space. The extension runs in a separate process and cannot access this memory.

**What still works:**
- ✅ SQL keyword completion (SELECT, FROM, WHERE, etc.)
- ✅ DuckDB function completion (500+ functions)
- ❌ Table and column autocomplete (no schema to read)

**Workarounds:**

1. **Use a file-based database** (Recommended):
   ```r
   con <- dbConnect(duckdb::duckdb(), dbdir = "my_project.duckdb")
   ```
   - Full autocomplete support for tables and columns
   - Persists between sessions
   - Can be large - DuckDB is efficient with disk storage

2. **Use a temporary file** (In-memory-like performance):
   ```r
   con <- dbConnect(duckdb::duckdb(), dbdir = tempfile(fileext = ".duckdb"))
   ```
   - Full autocomplete support
   - Automatically deleted when R session ends
   - Fast like in-memory databases

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Acknowledgments

Built with love for the **DuckDB** and R communities. Special thanks to the developers of:
- **DuckDB** - The amazing in-process analytical database that powers this extension
- DBI package - For standardizing database interfaces in R
- dbplyr and duckplyr - For seamless dplyr-to-SQL translation with DuckDB
- The Positron IDE team - For creating an excellent data science IDE
