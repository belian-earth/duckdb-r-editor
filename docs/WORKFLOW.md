# Workflow & Tips

## Table of Contents
- [Typical Workflow](#typical-workflow)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Understanding R Console Output](#understanding-r-console-output)
- [Working with Multiple Connections](#working-with-multiple-connections)
- [Empty Database Handling](#empty-database-handling)

---

## Typical Workflow

### Standard Development Flow

**1. Start R session in Positron**
```r
# Load required packages
library(DBI)
library(duckdb)
```

**2. Create DuckDB connection**
```r
# File-based database
con <- dbConnect(duckdb(), "mydata.duckdb")

# Or in-memory for testing
con <- dbConnect(duckdb(), ":memory:")
```

**3. Connect extension**
- Open Command Palette (`Cmd/Ctrl + Shift + P`)
- Run: **"DuckDB R Editor: Connect to DuckDB Database"**
- Select your connection (e.g., "con")

**4. Work with SQL**
```r
# Write SQL with full autocomplete
result <- dbGetQuery(con, "
  SELECT
    customer_id,
    SUM(amount) as total
  FROM orders
  WHERE order_date > CURRENT_DATE - INTERVAL '30 days'
  GROUP BY customer_id
  ORDER BY total DESC
")
```

**5. Keep working - no need to disconnect!**
- Extension queries R session in real-time
- No file locking issues
- Can write to database from R while extension is connected

---

## Best Practices

### 1. Connect Extension AFTER Creating R Connection

❌ **Wrong order:**
```r
# 1. Connect extension (no R connection exists yet)
# 2. Create R connection
con <- dbConnect(duckdb(), "data.duckdb")
```

✅ **Correct order:**
```r
# 1. Create R connection
con <- dbConnect(duckdb(), "data.duckdb")
# 2. Connect extension (finds the R connection)
```

**Why:** Extension needs an active R DuckDB connection to query.

---

### 2. Use File-Based Databases for Persistence

```r
# ✅ Recommended for production/analysis
con <- dbConnect(duckdb(), "sales_analysis.duckdb")

# ✅ Great for testing/exploration
con <- dbConnect(duckdb(), ":memory:")
```

**When to use each:**
- **File-based:** Production, analysis, sharing data
- **In-memory:** Testing, temporary transformations, exploration

---

### 3. Load Extensions in Both Places

**In settings.json (for autocomplete):**
```json
{
  "duckdb-r-editor.defaultExtensions": ["spatial"]
}
```

**In R code (for execution):**
```r
dbExecute(con, "INSTALL spatial")
dbExecute(con, "LOAD spatial")
```

**Why both:**
- Settings: Makes functions appear in autocomplete
- R code: Makes functions actually work in queries

---

### 4. Refresh Schema After DDL Changes

After creating/dropping tables in R:
```r
# Create new tables
dbExecute(con, "CREATE TABLE new_data (...)")

# Refresh extension schema
# Command Palette → "Refresh DuckDB Schema"
```

**Auto-refresh scenarios:**
- After `CREATE TABLE`
- After `DROP TABLE`
- After `ALTER TABLE`
- When switching connections

---

### 5. Use glue_sql() Instead of glue()

❌ **Avoid:**
```r
table <- "orders"
result <- dbGetQuery(con, glue("SELECT * FROM {table}"))
# Unsafe, doesn't escape properly
```

✅ **Recommended:**
```r
table <- "orders"
result <- dbGetQuery(con, glue_sql("SELECT * FROM {`table`}", .con = con))
# Safe SQL escaping, prevents injection
```

---

### 6. Leverage Air Formatter

Install [Air formatter](https://posit-dev.github.io/air/editor-vscode.html) for clean SQL in R:

**Before:**
```r
result <- dbGetQuery(con, "SELECT customer_id, name, SUM(amount) FROM orders WHERE active = TRUE GROUP BY customer_id, name")
```

**After (Air formatted):**
```r
result <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name,
    SUM(amount) as total
  FROM orders
  WHERE active = TRUE
  GROUP BY customer_id, name
  "
)
```

Full syntax highlighting and autocomplete work on the formatted SQL!

---

## Troubleshooting

### "No DuckDB connections found in R session"

**Symptoms:**
- Can't connect extension
- Error message when running connect command

**Causes & Solutions:**

**1. No R connection created yet**
```r
# Create a connection first
con <- dbConnect(duckdb(), "mydata.duckdb")
```

**2. Connection not in global environment**
```r
# Connection created inside function/scope
my_function <- function() {
  con <- dbConnect(duckdb(), "data.duckdb")  # Not in global env!
}

# Solution: Create in global scope
con <- dbConnect(duckdb(), "data.duckdb")
```

**3. Wrong object type**
```r
# Not a duckdb_connection
con <- "mydata.duckdb"  # Just a string!

# Solution: Use dbConnect
con <- dbConnect(duckdb(), "mydata.duckdb")
```

---

### "0 tables found" or Empty Database

**This is not an error!** The extension shows a helpful warning.

**Message you'll see:**
```
⚠️ Connected to con (:memory:) - Empty database (0 tables)
💡 Tip: Create tables in R, then use "Refresh DuckDB Schema" to update autocomplete
```

**What this means:**
- Extension connected successfully
- Database exists but has no tables yet
- Function autocomplete still works (900+ DuckDB functions available)
- Table/column autocomplete won't work until you create tables

**Solution:**
```r
# Create some tables
dbExecute(con, "CREATE TABLE customers (id INTEGER, name VARCHAR)")

# Refresh schema in extension
# Command Palette → "Refresh DuckDB Schema"

# Now autocomplete includes your tables!
```

---

### Extension Not Working

**Symptoms:**
- No autocomplete
- No syntax highlighting
- Commands don't appear

**Check:**

**1. Using Positron IDE?**
- Extension requires Positron, won't work in VS Code
- Check: Help → About → Should say "Positron"

**2. Extension activated?**
- Check Output panel: "DuckDB R Editor"
- Should see activation messages
- If not, reload window: Command Palette → "Reload Window"

**3. R session active?**
- Positron must have active R session
- Check: Console should show R prompt `>`

**4. File type correct?**
- Autocomplete only works in `.R` files
- Check: Bottom right of editor should say "R"

---

### Autocomplete Not Showing Tables/Columns

**Causes & Solutions:**

**1. Not connected to database**
```
Solution: Run "Connect to DuckDB Database" command
```

**2. Database is empty**
```
Solution: Create tables in R, then refresh schema
```

**3. Schema cache outdated**
```
Solution: Run "Refresh DuckDB Schema" command
```

**4. Autocomplete disabled**
```json
// Check settings.json
{
  "duckdb-r-editor.enableAutoComplete": true  // Should be true
}
```

---

### Autocomplete Not Showing Extension Functions

**Causes & Solutions:**

**1. Extension not loaded for autocomplete**
```json
// Add to settings.json
{
  "duckdb-r-editor.defaultExtensions": ["spatial"]
}
```

**2. Extension loaded only in R (not for autocomplete)**
```r
# This loads in R but not for autocomplete
dbExecute(con, "LOAD spatial")

# Solution: Also load via settings or Command Palette
```

**3. Extension failed to load**
```
Check Output panel for error messages
Try loading in R first: dbExecute(con, "INSTALL spatial")
```

---

### Syntax Highlighting Not Working

**1. Wrong file type**
- Must be `.R` file
- Check bottom right: Should say "R"

**2. Semantic highlighting disabled**
```json
// Enable in settings
{
  "duckdb-r-editor.useSemanticHighlighting": true
}
```

**3. Not in SQL string context**
- Only highlights SQL inside R strings
- Must be in: `dbGetQuery()`, `dbExecute()`, `sql()`, `glue_sql()`

---

## Understanding R Console Output

### What You'll See

When connecting or refreshing schema, you'll see this in your R console:

```r
> tryCatch({
+   # Get the specific connection object
+   if (!exists("con", envir = .GlobalEnv)) {
+       stop("Connection 'con' not found in R session")
+   }
+   # ... more code ...
+ })
__JSON_START__
[{"table_name":"orders","column_name":"order_id","data_type":"INTEGER","is_nullable":"NO"},...]
__JSON_END__
✓ DuckDB R Editor: Schema retrieved from R connection 'con'
```

### Is This Normal?

**Yes!** This is expected and intentional.

**What's happening:**
1. Extension sends R code to your session (via Positron API)
2. R code queries your DuckDB connection for schema
3. Results printed to console as JSON (between markers)
4. Extension parses the JSON for autocomplete
5. Success message confirms completion

### Why It Shows

- Positron's `executeCode()` API sends code to R console
- Extension uses "transient" mode to minimize output
- JSON markers help extension find the data
- Final message confirms success

### Can I Hide It?

Not currently - this is how the extension communicates with your R session. The output is minimal and confirms the extension is working correctly.

---

## Working with Multiple Connections

### Scenario: Multiple Databases

```r
# Sales database
sales_con <- dbConnect(duckdb(), "sales.duckdb")

# Analytics database
analytics_con <- dbConnect(duckdb(), "analytics.duckdb")

# In-memory for temp work
temp_con <- dbConnect(duckdb(), ":memory:")
```

### Selecting Connection

1. Run "Connect to DuckDB Database"
2. QuickPick shows all three connections
3. Select which one to use for autocomplete

### Switching Connections

**To switch to different connection:**
1. Run "Connect to DuckDB Database" again
2. Select different connection
3. Autocomplete now uses new connection's schema

**No need to disconnect first** - selecting new connection automatically switches.

### Connection Display

QuickPick shows:
- **Label:** Connection name (`sales_con`, `analytics_con`, `temp_con`)
- **Description:** Database path (`sales.duckdb`, `analytics.duckdb`, `:memory:`)
- **Detail:** Table count (`5 tables`, `12 tables`, `0 tables`)

---

## Empty Database Handling

### New in v0.4.0

Extension gracefully handles empty databases with helpful guidance.

### Connecting to Empty Database

**What you see:**
```
⚠️  Connected to con (:memory:) - Empty database (0 tables)
💡 Tip: Create tables in R, then use "Refresh DuckDB Schema" to update autocomplete
```

**Dialog shows:**
```
Connected to con (in-memory database)

⚠️  Database is empty - no tables found.

Autocomplete will work for DuckDB functions (900 available)
but not for tables/columns yet.

Create tables in R, then use "Refresh DuckDB Schema" command to update.
```

### Workflow

**1. Connect to empty database** → Warning (not error!)
**2. Create tables in R**
```r
dbExecute(con, "CREATE TABLE customers (id INTEGER, name VARCHAR)")
dbExecute(con, "CREATE TABLE orders (id INTEGER, customer_id INTEGER)")
```
**3. Refresh schema** → Command Palette → "Refresh DuckDB Schema"
**4. Autocomplete now works** for tables and columns!

### What Still Works

Even with empty database:
- ✅ Function autocomplete (900+ DuckDB functions)
- ✅ Keyword highlighting
- ✅ SQL syntax highlighting
- ✅ Extension loading
- ❌ Table autocomplete (no tables exist)
- ❌ Column autocomplete (no columns exist)

---

## Performance Tips

### Large R Files

If you have very large R files (>1000 lines) and notice slowness:

```json
{
  "duckdb-r-editor.useSemanticHighlighting": false
}
```

Falls back to lighter TextMate grammar.

### Many Tables

Schema queries scale well, but if you have 100+ tables:
- First connection may take 1-2 seconds
- Schema is cached until refresh
- Consider only loading needed schemas (DuckDB schemas feature)

### Extension Functions

Loading many extensions increases autocomplete list size:
- Still fast (900+ functions + extensions)
- Autocomplete filtering is efficient
- Only load extensions you actually use

---

## Tips & Tricks

### Tip 1: Connection Naming

Use clear connection names:
```r
# ✅ Clear
sales_db <- dbConnect(duckdb(), "sales.duckdb")
analytics_db <- dbConnect(duckdb(), "analytics.duckdb")

# ❌ Confusing
con1 <- dbConnect(duckdb(), "sales.duckdb")
con2 <- dbConnect(duckdb(), "analytics.duckdb")
```

Easier to select in QuickPick!

### Tip 2: Use "con" for Single Connection

Extension prioritizes "con" at top of connection list:
```r
con <- dbConnect(duckdb(), "mydata.duckdb")
# "con" appears first in QuickPick
```

### Tip 3: Output Panel for Debugging

View extension logs:
- View → Output → Select "DuckDB R Editor"
- Shows connection status, table counts, errors
- Useful for debugging issues

### Tip 4: Keyboard Shortcut for Connect

Create custom keyboard shortcut:
1. Preferences → Keyboard Shortcuts
2. Search: "DuckDB R Editor: Connect"
3. Add your preferred shortcut

### Tip 5: Project-Specific Extensions

Different projects need different extensions:
```json
// GIS project
{
  "duckdb-r-editor.defaultExtensions": ["spatial"]
}

// Data import project
{
  "duckdb-r-editor.defaultExtensions": ["httpfs", "json", "excel"]
}
```

---

[← Back to README](../README.md)
