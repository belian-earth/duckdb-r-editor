# DuckDB R Editor (Positron)

[![CI](https://github.com/h-a-graham/duckdb-r-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/h-a-graham/duckdb-r-editor/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![GitHub issues](https://img.shields.io/github/issues/h-a-graham/duckdb-r-editor)](https://github.com/h-a-graham/duckdb-r-editor/issues) [![Version](https://img.shields.io/github/package-json/v/h-a-graham/duckdb-r-editor)](https://github.com/h-a-graham/duckdb-r-editor) [![GitHub stars](https://img.shields.io/github/stars/h-a-graham/duckdb-r-editor)](https://github.com/h-a-graham/duckdb-r-editor/stargazers) 

> [!WARNING]
> Beta version. Report issues on [GitHub](https://github.com/h-a-graham/duckdb-r-editor/issues).

> [!NOTE]
> **Positron IDE Only** - Requires [Positron](https://github.com/posit-dev/positron). Will not work in VS Code.

**SQL syntax highlighting and intelligent autocomplete for DuckDB in R files.**

Write DuckDB SQL with full IDE support right inside R strings. Take full advantage of expressive SQL expressions within your R scripts!

------------------------------------------------------------------------

## Demo

![Schema Detection Demo](images/demo.gif)


------------------------------------------------------------------------

## Key Features

-   🎨 **SQL Syntax Highlighting** - Context-aware highlighting in R strings
-   🧠 **Smart Autocomplete** - 900+ DuckDB functions + live schema from R session
-   🔌 **R Connection Picker** - Select specific connection objects (supports `:memory:`)
-   🔄 **Auto-Refresh** - Detects schema changes automatically
-   🌈 **Visual Distinction** - Themed background colors for SQL strings
-   ✨ **SQL Auto-Format** - Format SQL with glue interpolation support
-   ✈️ **Air Formatter Support** - Works with multi-line SQL

------------------------------------------------------------------------

## Quick Start

### 1. Install

**Download Release (Recommended)** 

1. Download `.vsix` from [Releases](https://github.com/h-a-graham/duckdb-r-editor/releases/latest)
2. Positron: Extensions → ... → Install from VSIX

**Or Build from Source**

``` bash
git clone https://github.com/belian-earth/duckdb-r-editor.git
cd duckdb-r-editor
npm install
```

**With Make** (Linux/Mac/WSL - recommended):
``` bash
make              # Build and package
make quick        # Quick build (skip linting)
make help         # See all commands
```

**Without Make** (universal):
``` bash
npm run compile            # Compile TypeScript
npm run lint               # Run linter
npm run vsce:package       # Create .vsix file
```

The `.vsix` file will be created in the project root. Install it via Positron: Extensions → ... → Install from VSIX

*Note: Windows users can install Make via [Chocolatey](https://chocolatey.org/) (`choco install make`) or use [WSL](https://docs.microsoft.com/en-us/windows/wsl/)*

### 2. Connect in R

``` r
library(DBI)
library(duckdb)

con <- dbConnect(duckdb(), "mydata.duckdb")
# Or in-memory: dbConnect(duckdb(), ":memory:")
```

### 3. Connect the extension to the database

1.  Command Palette (`Cmd/Ctrl + Shift + P`)
2.  **"DuckDB R Editor: Connect to DuckDB Database"**
3.  Select your R connection (e.g., "con")
4.  Write SQL with autocomplete!

### 4. Write SQL

Autocomplete works in:

``` r
dbGetQuery(con, "SELECT * FROM ...")
dbExecute(con, "CREATE TABLE ...")
sql("SELECT ...")        # dbplyr
glue_sql("...", .con = con)
```

------------------------------------------------------------------------

## Configuration

Optional settings (`.vscode/settings.json`):

``` json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "httpfs"],
  "duckdb-r-editor.autoRefreshSchema": true,
  "duckdb-r-editor.useSemanticHighlighting": true,
  "duckdb-r-editor.sqlFormattingStyle": "standard",
  "duckdb-r-editor.sqlKeywordCase": "upper"
}
```

**Available Settings:**
- `enableAutoComplete` - Enable autocomplete (default: true)
- `useSemanticHighlighting` - Syntax highlighting (default: true)
- `defaultExtensions` - Extensions to auto-load (default: \[\])
- `autoRefreshSchema` - Auto-detect schema changes (default: true)
- `sqlFormattingStyle` - Format style: `standard`, `tabularLeft`, `tabularRight` (default: standard)
- `sqlKeywordCase` - Keyword case: `preserve`, `upper`, `lower` (default: preserve)

------------------------------------------------------------------------

## Commands

Access via Command Palette (`Cmd/Ctrl + Shift + P`):

-   **Connect to DuckDB Database** - Select R connection for schema
-   **Disconnect from Database** - Clear connection
-   **Refresh DuckDB Schema** - Manually update schema
-   **Format SQL String** - Format SQL at cursor (preserves glue interpolations)
-   **Load DuckDB Extension (One-Time)** - Load official extension until restart

------------------------------------------------------------------------

## Extension Loading

**Official Extensions** (Node.js - available before connecting): 
- Use command: "Load DuckDB Extension"
- Or settings: `"defaultExtensions": ["spatial", "httpfs"]`

**Community Extensions** (via R - auto-detected):

``` r
dbExecute(con, "INSTALL my_ext FROM community; LOAD my_ext;")
# -> Functions automatically available via auto-refresh
```

\* *Note that official extensions will also be auto-detected via the R session when loaded*

------------------------------------------------------------------------

## Auto-Refresh

Schema and functions refresh automatically when: 
- Creating/dropping tables: `CREATE TABLE`, `DROP TABLE`
-  Modifying data: `INSERT`, `UPDATE`, `DELETE`
-  Loading extensions: `INSTALL`, `LOAD`

Notifications show what changed:

```
✓ 2 new tables added to 'con' (Total: 5 tables)
✓ 45 new functions loaded in 'con' (Total: 945 functions)
```

\* *Disable in settings: `"autoRefreshSchema": false`*

------------------------------------------------------------------------

## Why This Extension?

Writing SQL in R strings without IDE support means: 
- Guessing table/column names
- No syntax validation until runtime
- Constant context switching to check schema

This extension provides: 
- ✅ Real-time autocomplete from your active R session
- ✅ Syntax highlighting and validation
- ✅ Seamless workflow - stay in your code

------------------------------------------------------------------------

## Acknowledgments

- **DuckDB** - Analytical database
- **Positron** - Data science IDE
- **Air formatter** - R code formatting
- R packages: `DBI`, `duckdb`, `dbplyr`, `glue`

------------------------------------------------------------------------

## Contributing

Contributions welcome! See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for build instructions and development workflow.

To contribute:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Ensure code passes linting: `make build` or `npm run lint`
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

[Open an issue on GitHub](https://github.com/h-a-graham/duckdb-r-editor/issues) for bug reports or feature requests.
