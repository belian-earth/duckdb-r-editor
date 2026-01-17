# Configuration Guide

## Table of Contents
- [Settings Reference](#settings-reference)
- [Loading DuckDB Extensions](#loading-duckdb-extensions)
- [Recommended Configurations](#recommended-configurations)

---

## Settings Reference

All settings are optional and have sensible defaults. Add them to `.vscode/settings.json` in your project or workspace.

### duckdb-r-editor.defaultExtensions

**Type:** `array` of `string`
**Default:** `[]`

DuckDB extensions to auto-load on activation. Extensions are loaded into the in-memory database for function autocomplete.

**Example:**
```json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "httpfs", "json"]
}
```

**Behavior:**
- Extensions load once when the extension activates
- Functions from extensions immediately available in autocomplete
- Failed extensions are logged but don't block activation
- Extensions remain loaded until Positron restarts

**Use Cases:**
- You regularly use spatial functions → Add `"spatial"`
- You frequently query remote files → Add `"httpfs"`
- You work with JSON data → Add `"json"`

---

### duckdb-r-editor.useSemanticHighlighting

**Type:** `boolean`
**Default:** `true`

Enable advanced SQL highlighting with context-aware colors and full Air formatter support.

**Recommended:** `true` (default)

**Example:**
```json
{
  "duckdb-r-editor.useSemanticHighlighting": true
}
```

**When enabled:**
- Context-aware colors (tables vs columns vs functions)
- Full multi-line Air formatter support
- Proper handling of commented code
- ~1-3ms overhead (negligible)

**When disabled:**
- Falls back to TextMate grammar injection
- Lighter weight
- Limited multi-line string support
- No context awareness

---

### duckdb-r-editor.enableAutoComplete

**Type:** `boolean`
**Default:** `true`

Enable DuckDB SQL autocomplete in R strings.

**Example:**
```json
{
  "duckdb-r-editor.enableAutoComplete": false
}
```

**Why disable:**
- You prefer manual SQL writing
- You have conflicting autocomplete extensions
- Performance concerns (though overhead is minimal)

---

### duckdb-r-editor.enableDiagnostics

**Type:** `boolean`
**Default:** `true`

Enable DuckDB SQL syntax validation.

**Example:**
```json
{
  "duckdb-r-editor.enableDiagnostics": false
}
```

**When enabled:**
- Real-time SQL syntax checking
- Error squiggles for invalid SQL
- Quick fixes for common issues

**When disabled:**
- No syntax validation
- Faster for very large files
- Useful if you have other SQL linters

---

## Loading DuckDB Extensions

DuckDB extensions add specialized functions (spatial, JSON, HTTP, parquet, etc.). There are three ways to load them for autocomplete.

### Method 1: Settings (Recommended)

**Best for:** Extensions you use regularly

Add to `.vscode/settings.json`:
```json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "httpfs", "json"]
}
```

**Advantages:**
- Auto-loads on activation
- Functions immediately available
- No manual steps each session
- Persistent across restarts (settings-based)

**How it works:**
1. Extension reads settings on activation
2. Loads extensions into in-memory Node.js DuckDB
3. Queries `duckdb_functions()` to get extension functions
4. Makes functions available in autocomplete

---

### Method 2: Command Palette (One-Time)

**Best for:** Experimental or rarely-used extensions

**Steps:**
1. Open Command Palette (`Cmd/Ctrl + Shift + P`)
2. Run: **"DuckDB R Editor: Load DuckDB Extension (One-Time)"**
3. Enter extension name (e.g., `parquet`, `postgres_scanner`)
4. Extension functions now appear in autocomplete

**Advantages:**
- Quick for testing extensions
- No settings file changes
- Flexible for different projects

**Limitations:**
- Lost on extension restart/reload
- Must reload each session
- Doesn't affect your R session

---

### Method 3: SQL in R Session

**Best for:** Loading extensions in your actual R DuckDB connection

```r
# Install and load in your R code
dbExecute(con, "INSTALL spatial")
dbExecute(con, "LOAD spatial")

# Extension is now loaded in YOUR R session
# You can now use extension functions in queries
result <- dbGetQuery(con, "
  SELECT
    ST_Distance(point1, point2) as distance
  FROM locations
")
```

**Note:** This loads the extension in your R session but **does not** add functions to the extension's autocomplete. Use Method 1 or 2 for autocomplete support.

**Why both?**
- Method 3: Extension works in your R queries (required for execution)
- Method 1/2: Extension functions appear in autocomplete (for IDE support)

**Recommended approach:** Use both
```json
// settings.json - for autocomplete
{
  "duckdb-r-editor.defaultExtensions": ["spatial"]
}
```

```r
# R code - for actual execution
dbExecute(con, "INSTALL spatial")
dbExecute(con, "LOAD spatial")
```

---

### Popular Extensions

| Extension | Description | Common Use Cases |
|-----------|-------------|------------------|
| `spatial` | GIS and geometry functions | Geospatial analysis, mapping, PostGIS compatibility |
| `httpfs` | Read files from HTTP/S3 | Remote data access, cloud storage |
| `json` | Advanced JSON functions | JSON parsing, nested data |
| `parquet` | Parquet file support | Efficient columnar storage |
| `postgres_scanner` | Query PostgreSQL | Federated queries, data migration |
| `excel` | Read Excel files | Excel data import |
| `icu` | International components | Text processing, collation |
| `fts` | Full-text search | Text search, indexing |

**Full list:** https://duckdb.org/docs/extensions/overview

---

### Extension Loading Errors

**Extension fails to load:**
```
Failed to load 'my_extension': Extension not found
```

**Troubleshooting:**
1. Check extension name spelling
2. Try installing in R first: `dbExecute(con, "INSTALL my_extension")`
3. Check if extension is available for your platform
4. Some extensions are experimental/community-maintained

**Failed extensions don't block others:**
```json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "invalid_extension", "json"]
}
```
Result: `spatial` and `json` load successfully, `invalid_extension` logs error

---

## Recommended Configurations

### Minimal (Default Experience)
```json
{
  "duckdb-r-editor.useSemanticHighlighting": true,
  "duckdb-r-editor.enableAutoComplete": true,
  "duckdb-r-editor.enableDiagnostics": true
}
```

This is the default - no configuration needed!

---

### Data Analyst (Common Extensions)
```json
{
  "duckdb-r-editor.defaultExtensions": ["httpfs", "json", "excel"],
  "duckdb-r-editor.useSemanticHighlighting": true,
  "duckdb-r-editor.enableAutoComplete": true,
  "duckdb-r-editor.enableDiagnostics": true
}
```

**Use case:** Importing data from various sources (cloud, JSON, Excel)

---

### GIS / Spatial Analysis
```json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "httpfs"],
  "duckdb-r-editor.useSemanticHighlighting": true,
  "duckdb-r-editor.enableAutoComplete": true,
  "duckdb-r-editor.enableDiagnostics": true
}
```

**Use case:** Geospatial analysis with PostGIS-compatible functions

---

### Performance-Focused (Large Files)
```json
{
  "duckdb-r-editor.useSemanticHighlighting": false,
  "duckdb-r-editor.enableAutoComplete": true,
  "duckdb-r-editor.enableDiagnostics": false
}
```

**Use case:** Working with very large R files where syntax highlighting overhead matters

---

### Minimal IDE Support (Manual SQL)
```json
{
  "duckdb-r-editor.useSemanticHighlighting": true,
  "duckdb-r-editor.enableAutoComplete": false,
  "duckdb-r-editor.enableDiagnostics": false
}
```

**Use case:** You prefer writing SQL manually but want syntax highlighting

---

## Workspace vs User Settings

### Project-Specific (Workspace)

**Location:** `.vscode/settings.json` in project root

**Use when:**
- Project uses specific extensions (e.g., spatial data project)
- Team shares configuration
- Different projects need different settings

**Example:**
```json
// .vscode/settings.json
{
  "duckdb-r-editor.defaultExtensions": ["spatial", "httpfs"]
}
```

---

### Global (User)

**Location:** Positron Settings → Extensions → DuckDB R Editor

**Use when:**
- You want same extensions for all projects
- Personal preferences
- Default behavior across workspace

**Workspace settings override user settings.**

---

## Settings File Location

### Create settings file:

1. Open Command Palette (`Cmd/Ctrl + Shift + P`)
2. Run: **"Preferences: Open Workspace Settings (JSON)"**
3. Add your configuration
4. Save

**Or manually:**
```bash
# Create .vscode folder if it doesn't exist
mkdir -p .vscode

# Create or edit settings.json
code .vscode/settings.json
```

---

[← Back to README](../README.md)
