# DuckDB R Editor

**SQL syntax highlighting and intelligent autocomplete for DuckDB in R files.** Designed for use with Positron IDE and Air formatter.

Write DuckDB SQL with full IDE support - syntax highlighting, autocomplete, and schema introspection - right inside R strings.

---

## Installation

### 1. Install Prerequisites

**Required:**
- [Positron IDE](https://github.com/posit-dev/positron) or VS Code
- R with `DBI` and `duckdb` packages
- Node.js 16+ (for building the extension)

**Recommended:**
- [DuckDB CLI](https://duckdb.org/docs/installation/) - Enables dynamic function discovery (500+ functions)
- [Air formatter](https://github.com/r-lib/air) - For clean multi-line SQL formatting

```r
# Install R packages
install.packages(c("DBI", "duckdb"))
```

### 2. Build and Install Extension

```bash
# Clone and build
git clone <repository-url>
cd rsqledit
npm install
npm run package

# Install the .vsix file in Positron/VSCode:
# Extensions → ... menu → Install from VSIX
```

---

## Why Use This Extension?

### Before: No SQL Support in R Strings
```r
result <- dbGetQuery(con, "
  SELECT customer_id, SUM(amount)
  FROM orders WHERE date > '2024-01-01'
  GROUP BY customer_id
")
```
❌ No syntax highlighting

❌ No autocomplete

❌ No error detection

### After: Full SQL IDE Features

**With syntax highlighting:**

<pre>
result <- dbGetQuery(con, "
  <span style="color: #569CD6">SELECT</span> customer_id, <span style="color: #DCDCAA">SUM</span>(amount)
  <span style="color: #569CD6">FROM</span> <span style="color: #4EC9B0">orders</span> <span style="color: #569CD6">WHERE</span> date > <span style="color: #CE9178">'2024-01-01'</span>
  <span style="color: #569CD6">GROUP BY</span> customer_id
")
</pre>

**Auto complete and syntax highlighting for:**
- <span style="color: #569CD6">**SQL keywords**</span> (SELECT, FROM, WHERE)
- <span style="color: #DCDCAA">**Functions**</span> (SUM, COUNT, DATE_TRUNC)
- <span style="color: #4EC9B0">**Table names**</span> (orders, customers)
- **Column names** (customer_id, amount)
- <span style="color: #CE9178">**String literals**</span>

✅ Autocomplete for tables, columns, and 500+ DuckDB functions

✅ Context-aware colors for different SQL elements

✅ Works with Air formatter multi-line strings

---

## Quick Start

### 1. Connect to DuckDB Database

**Option 1: Command Palette (Manual)**
- Open Command Palette (`Cmd/Ctrl + Shift + P`)
- Run: "DuckDB R Editor: Connect to DuckDB Database"
- Select your `.duckdb` file

**Option 2: Settings (Auto-connect on startup)**
```json
{
  "rsqledit.duckdbPath": "/path/to/your/database.duckdb"
}
```

**Option 3: Workspace Convention (Auto-detect)**
- Place a `test.duckdb` file in your workspace root
- Extension auto-connects on startup

### 2. Start Writing SQL

SQL autocomplete works automatically in these functions:
```r
dbGetQuery()
dbExecute()
dbSendQuery()
dbSendStatement()
sql()              # dbplyr
glue_sql()         # glue package
```

### 3. Example: Full Autocomplete in Action

```r
library(DBI)
library(duckdb)

con <- dbConnect(duckdb(), "sales.duckdb")

# Create a table
dbExecute(con, "
  CREATE TABLE orders (
    order_id INTEGER,
    customer_id INTEGER,
    amount DECIMAL,
    order_date DATE
  )
")

# Get autocomplete for everything!
result <- dbGetQuery(con, "
  SELECT
    customer_id,
    DATE_TRUNC('month', order_date) as month,
    SUM(amount) as total
  FROM orders
  WHERE order_date > CURRENT_DATE - INTERVAL '30 days'
  GROUP BY customer_id, month
  ORDER BY total DESC
")
```

**What you see as you type:**

<pre>
result <- dbGetQuery(con, "
  <span style="color: #569CD6">SELECT</span>
    customer_id,                             <i>← Column (autocompleted from schema)</i>
    <span style="color: #DCDCAA">DATE_TRUNC</span>(<span style="color: #CE9178">'month'</span>, order_date) <span style="color: #569CD6">AS</span> month,  <i>← Function (with signature in autocomplete)</i>
    <span style="color: #DCDCAA">SUM</span>(amount) <span style="color: #569CD6">AS</span> total
  <span style="color: #569CD6">FROM</span> <span style="color: #4EC9B0">orders</span>                                   <i>← Table (autocompleted)</i>
  <span style="color: #569CD6">WHERE</span> order_date > <span style="color: #DCDCAA">CURRENT_DATE</span> - <span style="color: #569CD6">INTERVAL</span> <span style="color: #CE9178">'30 days'</span>
  <span style="color: #569CD6">GROUP BY</span> customer_id, month
  <span style="color: #569CD6">ORDER BY</span> total <span style="color: #569CD6">DESC</span>
")
</pre>

<span style="color: #569CD6">**Keywords**</span> | <span style="color: #DCDCAA">**Functions**</span> | <span style="color: #4EC9B0">**Tables**</span> | **Columns** | <span style="color: #CE9178">**Strings**</span>

---

## Key Features

### 🎨 Context-Aware Syntax Highlighting
- **Keywords**: `SELECT`, `FROM`, `WHERE`, `INSTALL`, `LOAD`, `DESCRIBE`
- **Functions**: `COUNT()`, `SUM()`, `DATE_TRUNC()` (distinct color)
- **Tables**: After `FROM`, `JOIN` (distinct color)
- **Columns**: Everywhere else (distinct color)
- **Works with Air formatter** - Multi-line strings on separate lines fully supported

### 🧠 Intelligent Autocomplete
- **500+ DuckDB functions** with signatures and examples
- **Schema-aware**: Tables and columns from your connected database
- **Smart context**: Only suggests tables after `FROM`, columns after `SELECT`
- **Dot notation**: Type `table.` for column suggestions

### 🦆 DuckDB-Specific Support
All DuckDB commands highlighted and autocompleted:
```r
dbExecute(con, "INSTALL spatial")        # Extension management
dbExecute(con, "LOAD spatial")           # Load for autocomplete support
dbExecute(con, "ATTACH 'other.db'")      # Database operations
dbGetQuery(con, "DESCRIBE customers")    # Metadata commands
dbGetQuery(con, "SHOW TABLES")
dbGetQuery(con, "SUMMARIZE orders")      # Quick data summary
```

💡 **Tip**: Load extensions via Command Palette or SQL to get autocomplete for their functions (see "Loading DuckDB Extensions" below)

### 🔧 Glue Package Integration
```r
library(glue)

table <- "orders"
min_amount <- 100

result <- dbGetQuery(con, glue_sql("
  SELECT *
  FROM {`table`}              -- R interpolation
  WHERE amount > {min_amount}
  ORDER BY order_date DESC    -- Full SQL autocomplete!
", .con = con))
```

### ✈️ Air Formatter Support
Works perfectly with Air formatter's multi-line style:
```r
# Air formatter style - string on separate line
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
# ✅ Full syntax highlighting and autocomplete!
```

### 🔌 Loading DuckDB Extensions

DuckDB extensions add specialized functions (spatial, JSON, HTTP, etc.). Load them to get autocomplete for their functions:

**Using Command Palette:**
1. Open Command Palette (`Cmd/Ctrl + Shift + P`)
2. Run: "DuckDB R Editor: Load DuckDB Extension"
3. Enter extension name (e.g., `spatial`, `httpfs`, `json`)
4. Extension functions now appear in autocomplete!

**Using SQL:**
```r
# Install and load in your R code (recommended)
dbExecute(con, "INSTALL spatial")
dbExecute(con, "LOAD spatial")

# Now autocomplete includes spatial functions
result <- dbGetQuery(con, "
  SELECT
    ST_Distance(point1, point2) as distance
  FROM locations
")
```

**Popular extensions:**
- `spatial` - GIS and geometry functions
- `httpfs` - Read files from HTTP/S3
- `json` - Advanced JSON functions
- `parquet` - Parquet file support
- `postgres_scanner` - Query PostgreSQL databases

---

## Configuration

```json
{
  // Path to DuckDB database (optional - auto-connects in Positron)
  "rsqledit.duckdbPath": "/path/to/database.duckdb",

  // Enable advanced SQL highlighting (default: true, recommended)
  "rsqledit.useSemanticHighlighting": true,

  // Enable autocomplete (default: true)
  "rsqledit.enableAutoComplete": true,

  // Enable SQL validation (default: true)
  "rsqledit.enableDiagnostics": true
}
```

---

## Commands

| Command | Description |
|---------|-------------|
| **Connect to DuckDB Database** | Manually connect to a `.duckdb` file |
| **Refresh DuckDB Schema** | Refresh table/column information |
| **Load DuckDB Extension** | Load extensions for autocomplete (e.g., `spatial`, `httpfs`) |
| **Execute Query at Cursor** | Run SQL query and view results |

Access via Command Palette (`Cmd/Ctrl + Shift + P`)

---

## Important Notes

### In-Memory Databases Not Supported for Schema
```r
# ❌ No table/column autocomplete
con <- dbConnect(duckdb::duckdb(), dbdir = ":memory:")

# ✅ Full autocomplete support
con <- dbConnect(duckdb::duckdb(), dbdir = "mydata.duckdb")
```

**Why?** In-memory databases can't be accessed by the extension. Use file-based databases for full autocomplete.

**Workaround for testing:**
```r
# Use temporary file (deleted on exit)
con <- dbConnect(duckdb::duckdb(), dbdir = tempfile(fileext = ".duckdb"))
```

### Semantic Highlighting (Default, Recommended)
The extension uses an optimized semantic token provider for:
- Context-aware colors (tables vs columns vs functions)
- Air formatter multi-line string support
- Proper handling of commented code

Performance: ~1-3ms overhead (negligible). To disable:
```json
{
  "rsqledit.useSemanticHighlighting": false
}
```

---

## Positron Integration

The extension works in Positron IDE with the same features as VS Code:
- **Connect once** via Command Palette or settings
- **Schema autocomplete** from your connected database
- **Executes queries** in the extension (not in R console)
- **Works alongside** your R DBI connections

Same features available in both VS Code and Positron.

---

## Tips

1. **Connect to your database first** - Use Command Palette or set `rsqledit.duckdbPath` in settings
2. **Load extensions for their functions** - Use "Load DuckDB Extension" command or `LOAD` SQL command
3. **Use file-based databases** for table/column autocomplete (in-memory databases not supported)
4. **Type `table.`** to get column-specific suggestions
5. **Install DuckDB CLI** for dynamic function discovery (all extensions supported)
6. **Use `glue_sql()`** instead of `glue()` for safer SQL interpolation

---

## License

MIT

## Acknowledgments

Built for the DuckDB and R communities. Thanks to:
- **DuckDB** - The amazing analytical database
- **Positron** - Excellent data science IDE
- **Air formatter** - Clean R code formatting
- R packages: `DBI`, `duckdb`, `dbplyr`, `glue`
