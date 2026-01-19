# DuckDB R Editor (Positron)

> [!WARNING]
> Beta version. Report issues on [GitHub](https://github.com/h-a-graham/duckdb-r-editor/issues).

> [!NOTE]
> **Positron IDE Only** - Requires [Positron](https://github.com/posit-dev/positron). Will not work in VS Code.

**SQL syntax highlighting and intelligent autocomplete for DuckDB in R files.**

Write DuckDB SQL with full IDE support right inside R strings. Take full advantage of expressive SQL expressions within your R scripts!

---

## Key Features

- 🎨 **SQL Syntax Highlighting** - Context-aware highlighting in R strings
- 🧠 **Smart Autocomplete** - 900+ DuckDB functions + live schema from R session
- 🔌 **R Connection Picker** - Select specific connection objects (supports `:memory:`)
- 🔄 **Auto-Refresh** - Detects schema changes automatically
- ⚡ **Hybrid Functions** - Combines Node.js base + R session functions
- 🌈 **Visual Distinction** - Themed background colors for SQL strings
- ✈️ **Air Formatter Support** - Works with multi-line SQL

---

## Quick Start

### 1. Install

**Download Release (Recommended)**
1. Download `.vsix` from [Releases](https://github.com/h-a-graham/duckdb-r-editor/releases/latest)
2. Positron: Extensions → ... → Install from VSIX

**Or Build from Source**
```bash
git clone https://github.com/h-a-graham/duckdb-r-editor.git
cd duckdb-r-editor
npm install && npm run vsce:package
```

### 2. Connect in R

```r
library(DBI)
library(duckdb)

con <- dbConnect(duckdb(), "mydata.duckdb")
# Or in-memory: dbConnect(duckdb(), ":memory:")
```

### 3. Connect Extension

1. Command Palette (`Cmd/Ctrl + Shift + P`)
2. **"DuckDB R Editor: Connect to DuckDB Database"**
3. Select your R connection (e.g., "con")
4. Write SQL with autocomplete!

### 4. Write SQL

Autocomplete works in:
```r
dbGetQuery(con, "SELECT * FROM ...")
dbExecute(con, "CREATE TABLE ...")
sql("SELECT ...")        # dbplyr
glue_sql("...", .con = con)
```

---

## Configuration

Optional settings (`.vscode/settings.json`):

```json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "httpfs"],
  "duckdb-r-editor.autoRefreshSchema": true,
  "duckdb-r-editor.useSemanticHighlighting": true
}
```

**Available Settings:**
- `enableAutoComplete` - Enable autocomplete (default: true)
- `enableSQLHighlighting` - Syntax highlighting (default: true)
- `useSemanticHighlighting` - Advanced highlighting (default: true)
- `defaultExtensions` - Extensions to auto-load (default: [])
- `autoRefreshSchema` - Auto-detect schema changes (default: true)

---

## Commands

Access via Command Palette (`Cmd/Ctrl + Shift + P`):

- **Connect to DuckDB Database** - Select R connection for schema
- **Disconnect from Database** - Clear connection
- **Refresh DuckDB Schema** - Manually update schema
- **Load DuckDB Extension (One-Time)** - Load official extension until restart

---

## Extension Loading

**Official Extensions** (Node.js - available before connecting):
- Use command: "Load DuckDB Extension"
- Or settings: `"defaultExtensions": ["spatial", "httpfs"]`
- Examples: spatial, httpfs, json, parquet

**Community Extensions** (via R - auto-detected):
```r
dbExecute(con, "INSTALL my_ext FROM community; LOAD my_ext;")
# Functions automatically available via auto-refresh
```

---

## Auto-Refresh

Schema and functions refresh automatically when:
- Creating/dropping tables: `CREATE TABLE`, `DROP TABLE`
- Modifying data: `INSERT`, `UPDATE`, `DELETE`
- Loading extensions: `INSTALL`, `LOAD`

Notifications show what changed:
- `✓ 2 new tables added to 'con' (Total: 5 tables)`
- `✓ 45 new functions loaded in 'con' (Total: 945 functions)`

Disable in settings: `"autoRefreshSchema": false`

---

## Why This Extension?

Writing SQL in R strings without IDE support means:
- Guessing table/column names
- No syntax validation until runtime
- Constant context switching to check schema

This extension provides:
- ✅ Real-time autocomplete from your active R session
- ✅ Syntax highlighting and validation
- ✅ Zero file locking (queries R directly)
- ✅ Seamless workflow - stay in your code

---

## License

MIT

## Acknowledgments

Built for DuckDB and R communities. Thanks to:
- **DuckDB** - Analytical database
- **Positron** - Data science IDE
- **Air formatter** - R code formatting
- R packages: `DBI`, `duckdb`, `dbplyr`, `glue`

---

## Contributing

[Open an issue on GitHub](https://github.com/h-a-graham/duckdb-r-editor/issues)
