# Claude Code Context for DuckDB R Editor

## Quick Reference for Future Sessions

### Architecture Overview
- **Language**: TypeScript extension for VS Code/Positron
- **Purpose**: SQL syntax highlighting and autocomplete for DuckDB in R files
- **Key Feature**: Semantic token provider for context-aware SQL highlighting

### Important Implementation Details

1. **Semantic Highlighting** (`.claude/docs/semantic-highlighting.md`)
   - Uses efficient O(n) two-pass algorithm
   - Pass 1: Find SQL functions (dbGetQuery, glue_sql, etc.)
   - Pass 2: Find strings within those functions
   - Performance: ~1-3ms per file
   - Enabled by default in settings

2. **Air Formatter Support** (`.claude/docs/air-formatter-support.md`)
   - Handles multi-line strings where SQL starts on a separate line
   - Context-aware token classification (tables vs columns vs functions)
   - Properly skips R commented code

3. **Connection Management**
   - Manual: Command Palette → "Connect to DuckDB Database"
   - Auto: Set `rsqledit.duckdbPath` in settings
   - Auto-detect: Place `test.duckdb` in workspace root
   - NO automatic R session discovery (despite what old docs said)

### Key Files

- `src/semanticTokenProvider.ts` - SQL syntax highlighting (optimized)
- `src/sqlStringDetector.ts` - Detects SQL strings in R code
- `src/completionProvider.ts` - Autocomplete logic
- `src/extension.ts` - Main entry point
- `syntaxes/r-sql-injection.json` - TextMate grammar (fallback)

### Settings

- `useSemanticHighlighting` (default: true) - Use advanced highlighting
- `duckdbPath` - Path to database for auto-connect
- `enableAutoComplete` (default: true)
- `enableDiagnostics` (default: true)

### Known Limitations

- In-memory databases (`:memory:`) not supported for schema autocomplete
- No hover documentation provider (only autocomplete documentation)
- No automatic R session connection discovery

### DuckDB-Specific Features

Comprehensive keyword support including:
- Extension commands: INSTALL, LOAD
- Metadata: DESCRIBE, SHOW, SUMMARIZE
- Data types: All DuckDB types (INTEGER, TIMESTAMP, JSON, ARRAY, etc.)

### Color Scheme (VS Code Dark+)

- `#569CD6` (Blue) - Keywords
- `#DCDCAA` (Yellow) - Functions
- `#4EC9B0` (Cyan) - Table names
- White - Column names
- `#CE9178` (Orange) - Strings

## For Future Development

When enhancing this extension:
1. Check `.claude/docs/` for architectural context
2. Update performance docs if changing semantic provider
3. Test with Air formatter patterns (see `test_air_format.R`)
4. Verify no crashes with large files (safety limits in place)

## Recent Major Changes

- **Jan 2026**: Optimized semantic highlighting (O(n²) → O(n))
- **Jan 2026**: Added comprehensive DuckDB keyword support
- **Jan 2026**: Made semantic highlighting default (stable + fast)
