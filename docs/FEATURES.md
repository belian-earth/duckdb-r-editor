# Detailed Features Guide

## Table of Contents
- [Context-Aware Syntax Highlighting](#context-aware-syntax-highlighting)
- [Intelligent Autocomplete](#intelligent-autocomplete)
- [R Connection Selection](#r-connection-selection)
- [DuckDB-Specific Support](#duckdb-specific-support)
- [Glue Package Integration](#glue-package-integration)
- [Air Formatter Support](#air-formatter-support)
- [In-Memory Database Support](#in-memory-database-support)

---

## Context-Aware Syntax Highlighting

The extension provides semantic highlighting that understands SQL context within R strings.

### What Gets Highlighted

- **Keywords**: `SELECT`, `FROM`, `WHERE`, `JOIN`, `INSTALL`, `LOAD`, `DESCRIBE`
- **Functions**: `COUNT()`, `SUM()`, `DATE_TRUNC()` (distinct color from keywords)
- **Tables**: After `FROM`, `JOIN` (distinct color showing schema awareness)
- **Columns**: Everywhere else (distinct color, context-aware)
- **Literals**: Strings, numbers, dates (proper SQL literal highlighting)

### Highlighting Modes

**Semantic Highlighting (Default, Recommended)**
- Context-aware colors (tables vs columns vs functions)
- Full Air formatter support for multi-line strings
- Proper handling of commented code
- Performance: ~1-3ms overhead (negligible)

**TextMate Grammar (Fallback)**
- Lighter weight
- Limited multi-line support
- Enable by setting: `"duckdb-r-editor.useSemanticHighlighting": false`

### Color Legend

🔵 **Keywords** | 🟡 **Functions** | 🔷 **Tables** | 📋 **Columns** | 🟠 **Strings**

---

## Intelligent Autocomplete

### What's Included

**900+ DuckDB Functions**
- All built-in DuckDB functions
- Extension functions (when loaded)
- Function signatures with parameter types
- Return type information
- Inline documentation

**Live Schema from R Session**
- Tables from your active R connection
- Columns for each table
- Data types
- Nullable information

### Context-Aware Suggestions

The autocomplete engine understands SQL context:

**After SELECT:**
- Column names
- Aggregate functions (SUM, COUNT, AVG)
- Window functions
- Expressions

**After FROM:**
- Table names from your R session
- Common table expressions (CTEs)

**After WHERE:**
- Column names
- Comparison operators
- Functions

**Dot Notation:**
Type `table.` to see all columns for that specific table.

### Trigger Characters

Autocomplete automatically triggers on:
- `.` (for table.column)
- `(` (for functions)
- Space
- Newline
- Quotes (`"`, `'`)
- SQL keywords (S, E, F, W, J, O, I)
- SQL operators (`*`, `,`, `=`)

---

## R Connection Selection

### QuickPick Interface

When you run "Connect to DuckDB Database", the extension:

1. Discovers all DuckDB connections in your R global environment
2. Shows them in a QuickPick UI with:
   - **Label**: Connection object name (e.g., "con", "db")
   - **Description**: Database path or `:memory:`
   - **Detail**: Table count

3. You select which connection to use

### Connection Prioritization

The "con" connection object appears first in the list for convenience.

### Multiple Connection Support

You can:
- Have multiple DuckDB connections open in R
- Switch between them using the connect command
- Each connection can be to a different database
- In-memory and file-based connections work equally well

### Example

```r
# Create multiple connections
con1 <- dbConnect(duckdb(), "sales.duckdb")
con2 <- dbConnect(duckdb(), ":memory:")
db_analytics <- dbConnect(duckdb(), "analytics.duckdb")
```

Running connect command shows all three, you pick which one to use.

---

## DuckDB-Specific Support

All DuckDB-specific commands are highlighted and autocompleted:

### Extension Management
```r
dbExecute(con, "INSTALL spatial")
dbExecute(con, "LOAD spatial")
dbExecute(con, "INSTALL httpfs FROM 'http://custom.repo'")
```

### Database Operations
```r
dbExecute(con, "ATTACH 'other.db' AS other_db")
dbExecute(con, "DETACH other_db")
dbExecute(con, "USE other_db")
```

### Metadata Commands
```r
dbGetQuery(con, "DESCRIBE customers")
dbGetQuery(con, "SHOW TABLES")
dbGetQuery(con, "SHOW ALL TABLES")
dbGetQuery(con, "SUMMARIZE orders")  # Quick data summary
dbGetQuery(con, "PRAGMA table_info('customers')")
```

### Export/Import
```r
dbExecute(con, "COPY customers TO 'customers.parquet'")
dbExecute(con, "COPY customers TO 'customers.csv'")
dbGetQuery(con, "SELECT * FROM 'data.parquet'")  # Direct file query
```

---

## Glue Package Integration

The extension works seamlessly with the `glue` package for SQL templating.

### Basic Usage

```r
library(glue)

table_name <- "orders"
min_amount <- 100

result <- dbGetQuery(con, glue_sql("
  SELECT *
  FROM {`table_name`}              -- R variable interpolation
  WHERE amount > {min_amount}       -- Safe parameter binding
  ORDER BY order_date DESC          -- Full SQL autocomplete works!
", .con = con))
```

### Why glue_sql() Over glue()

- `glue_sql()` properly escapes SQL identifiers and values
- Prevents SQL injection
- Handles NULL values correctly
- More robust for production code

### Autocomplete Support

SQL autocomplete works inside `glue_sql()` strings:
- Table names
- Column names
- DuckDB functions
- Keywords

---

## Air Formatter Support

The extension works perfectly with [Air formatter](https://posit-dev.github.io/air/editor-vscode.html)'s multi-line SQL style.

### Before Air (Traditional R Style)
```r
# SQL cramped on one line - hard to read
result <- dbGetQuery(con, "SELECT customer_id, name FROM customers WHERE active = TRUE")
```

### After Air (Multi-line Style)
```r
# Air formatter places string on separate line
result <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name
  FROM customers
  WHERE active = TRUE
  "
)
# ✅ Full syntax highlighting and autocomplete work!
```

### Benefits

- Clean, readable SQL in R files
- Full IDE support on the SQL string
- Proper indentation
- Easy to maintain complex queries

### How It Works

The extension's semantic token provider specifically handles:
- Strings on separate lines from function calls
- Multi-line strings with leading/trailing whitespace
- Proper scope detection for R function contexts

---

## In-Memory Database Support

The extension fully supports DuckDB in-memory databases.

### Why It Works

Traditional extensions that open database files can't work with `:memory:` because there's no file to open. This extension queries your R session directly, so it works with any connection type.

### Examples

**Pure In-Memory:**
```r
con <- dbConnect(duckdb(), ":memory:")
# ✅ Extension can connect and get schema
```

**File-Based:**
```r
con <- dbConnect(duckdb(), "mydata.duckdb")
# ✅ Also works perfectly
```

**Temporary Files:**
```r
con <- dbConnect(duckdb(), tempfile(fileext = ".duckdb"))
# ✅ No problem
```

### Use Cases

**Testing:**
```r
test_con <- dbConnect(duckdb(), ":memory:")
dbExecute(test_con, "CREATE TABLE test_data AS SELECT * FROM read_csv('test.csv')")
# Write tests with full autocomplete support
```

**Data Exploration:**
```r
con <- dbConnect(duckdb(), ":memory:")
dbExecute(con, "CREATE TABLE sales AS SELECT * FROM 'data/*.parquet'")
# Explore data without creating database files
```

**ETL Pipelines:**
```r
temp_con <- dbConnect(duckdb(), ":memory:")
# Process data in-memory with full IDE support
# Export to final destination when done
```

---

## Autocomplete Functions Reference

### Supported R Functions

SQL autocomplete automatically triggers in these R functions:

**DBI Package:**
- `dbGetQuery()`
- `dbExecute()`
- `dbSendQuery()`
- `dbSendStatement()`

**dbplyr Package:**
- `sql()`

**glue Package:**
- `glue_sql()`

### Adding Support for Custom Functions

If you have custom wrapper functions, autocomplete should work as long as:
1. The SQL string is a direct argument to the function
2. The string is quoted with `"` or `'`

---

## Performance Considerations

### Semantic Highlighting

- **Overhead**: ~1-3ms per file
- **Algorithm**: O(n) single-pass parser
- **Caching**: Document cache invalidates only on edits
- **Memory**: Minimal - only caches parsed tokens

### Schema Queries

- **Frequency**: Only on connect and manual refresh
- **Method**: Single R session query
- **Caching**: Schema cached in memory until refresh

### Function Discovery

- **Frequency**: Once on activation (+ when loading extensions)
- **Method**: Query Node.js in-memory DuckDB
- **Storage**: All 900+ functions cached in memory

---

[← Back to README](../README.md)
