# Architecture Overview

## Core Components

### 1. Schema Provider (PositronSchemaProvider)
- Queries R session via Positron API for table/column schema
- Uses silent R code execution with file-based data transfer
- Supports specific connection selection (including `:memory:`)
- Auto-refresh on schema changes

### 2. Function Provider (DuckDBFunctionProvider)
- **Hybrid approach**: Node.js base + R session override
- Node.js DuckDB provides ~900 base functions immediately
- R session functions override when connected (source of truth)
- Supports official extension auto-loading via settings

### 3. Completion Provider (SQLCompletionProvider)
- Context-aware autocomplete (tables, columns, functions, keywords)
- Detects SQL strings in DBI and glue functions
- Handles connection-specific schema via connection name extraction
- Works with Air formatter multi-line strings

### 4. Syntax Highlighting
- **Semantic tokens** - O(n) algorithm for context-aware highlighting
- **TextMate grammar** - Fallback for basic highlighting
- **Background decorator** - Theme-aware SQL string backgrounds
- Efficient caching with document invalidation

### 5. SQL String Detection (SQLStringDetector)
- Detects SQL in: `dbExecute`, `dbGetQuery`, `sql()`, `glue_sql()`
- Validates scope with proper parenthesis matching
- Extracts connection names from function arguments
- Handles glue interpolation blocks `{}`

## Data Flow

### Connection Workflow
```
1. User: "Connect to DuckDB Database"
2. Extension: Execute R code to discover connections
3. R: Returns list of connection objects with metadata
4. Extension: Show QuickPick → User selects "con"
5. Extension: Query schema from "con" in R session
6. Extension: Query functions from "con" in R session
7. Extension: Merge R functions with Node.js base
8. Ready: Autocomplete active!
```

### Auto-Refresh Workflow
```
1. User executes R code: dbExecute(con, "CREATE TABLE...")
2. Positron: onDidExecuteCode event fires
3. Extension: Checks if code references connection
4. Extension: Detects CREATE TABLE pattern
5. Extension: Debounced refresh (1.5s delay)
6. Extension: Query updated schema from R
7. Extension: Compare table/function counts
8. Extension: Show notification if changed
```

### Autocomplete Workflow
```
1. User types in SQL string: dbGetQuery(con, "SELECT * FROM |")
2. Extension: Detect cursor inside SQL string
3. Extension: Identify context (after FROM)
4. Extension: Provide table completions
5. User selects table → show column completions
```

## Key Design Decisions

### Why Hybrid Function Provider?
- **Before connecting**: Node.js provides immediate autocomplete
- **After connecting**: R functions reflect actual session state
- **Extensions in R**: Automatically detected and available
- **Best of both**: Fast + accurate

### Why File-Based R Communication?
- Silent execution (no console pollution)
- Handles large data efficiently
- Avoids stdout parsing issues
- Clean error handling

### Why Connection Selection UI?
- Supports multiple connections in one session
- Enables `:memory:` database support (no file path)
- User explicitly chooses - no ambiguity
- Matches R mental model

### Why Auto-Refresh?
- Keeps autocomplete in sync automatically
- Detects: schema changes, extension loading
- Debounced to avoid spam
- User notifications show what changed

## Performance Considerations

### Efficient Caching
- Document cache invalidates on changes
- SQL regions cached per document
- Function/schema providers maintain in-memory maps

### Minimal R Execution
- Only when connection used in code
- Debounced to batch rapid changes (1.5s)
- Silent mode prevents console pollution
- Temp files cleaned up automatically

### Fast SQL Detection
- O(n) semantic token algorithm (~1-3ms)
- Early exit on large documents (>1MB)
- Context-line lookback limited (10 lines)
- Efficient regex patterns

## Extension Points

### Settings
- `defaultExtensions` - Auto-load official extensions
- `autoRefreshSchema` - Toggle auto-refresh
- `useSemanticHighlighting` - Toggle advanced highlighting

### Commands
- Connect/Disconnect - Manage connections
- Refresh Schema - Manual refresh
- Load Extension - One-time official extensions

## Technology Stack

- **TypeScript** - Type-safe development
- **Positron API** - R session integration
- **Node.js DuckDB** - Base function provider
- **esbuild** - Fast bundling
- **VSCode Extension API** - UI and language services
