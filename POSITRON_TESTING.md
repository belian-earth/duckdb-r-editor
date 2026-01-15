# Positron Integration Testing Guide

## What's New in Positron Mode

The R SQL Editor now has **native Positron integration**! When running in Positron, the extension:

1. ✅ **Uses your R session's database connection** - No separate Node.js connection, no lock conflicts
2. ✅ **Auto-discovers schema** from your R session - Always in sync with your actual connection
3. ✅ **Executes queries in R console** - Results appear in your R environment
4. ✅ **Detects Positron automatically** - Seamlessly switches between VSCode and Positron modes

## Testing Workflow

### Step 1: Launch Extension Development Host

In Positron, with the rsqledit folder open:

1. Press **F5** (or Run → Start Debugging)
2. A new Positron window opens with "[Extension Development Host]" in the title
3. Check the **Output** panel (View → Output, select "R SQL Editor") for:
   ```
   R SQL Editor extension is now active
   Running in Positron mode
   Initializing Positron schema provider (using R session)
   ```

### Step 2: Create R Connection

In the Extension Development Host, open the **Console** and run:

```r
library(duckdb)
con <- dbConnect(duckdb::duckdb(), dbdir = "test.duckdb")

# Verify table exists
DBI::dbListTables(con)
```

You should see:
```r
[1] "mtcars"
```

### Step 3: Test Schema Discovery

The extension should automatically detect your connection within 30 seconds. To force immediate refresh:

1. Open Command Palette: **Cmd/Ctrl+Shift+P**
2. Run: **R SQL: Refresh Database Schema**
3. Should see: "Schema refreshed: 1 tables found"

Check the Output panel for:
```
Schema refreshed: 1 tables found
```

### Step 4: Test SQL Autocomplete

Open `test.R` in the Extension Development Host.

**Test A: Column Completions**

1. Place cursor after `"SELECT "` on line 9
2. Press **Ctrl+Space** (Cmd+Space on Mac)
3. You should see completions for all mtcars columns:
   - `mpg` (DOUBLE)
   - `cyl` (DOUBLE)
   - `disp` (DOUBLE)
   - `hp` (DOUBLE)
   - etc.

**Test B: Table Completions**

1. Type `"SELECT * FROM "`
2. Press **Ctrl+Space**
3. Should see `mtcars` with column information

**Test C: Function Completions**

1. Type `"SELECT COUNT"`
2. Press **Ctrl+Space**
3. Should see DuckDB functions like:
   - `COUNT()`
   - `COUNT_IF()`
   - `COUNTIF()`

**Test D: Dot Notation**

1. Type `"SELECT mtcars."`
2. Press **Ctrl+Space**
3. Should see only columns from mtcars table

**Test E: Glue Integration**

Test the glue sections in test.R (lines 11-21):

1. In the glue_sql string, place cursor after `"SELECT "`
2. Press **Ctrl+Space**
3. Should see SQL completions (not R completions)
4. Move cursor inside `{min_mpg}` and press **Ctrl+Space**
5. Should see R completions (the extension knows you're in R context)

### Step 5: Test Query Execution

**In Positron Mode:**

1. Place cursor on line 6 (the complete query)
2. Run: **R SQL: Execute Query at Cursor**
3. The query executes in your R console
4. Results appear as `.rsqledit_result` in your environment
5. You should see the results printed in the console

### Step 6: Test Schema Auto-Refresh

Add a new table in your R console:

```r
# Create a new table
DBI::dbWriteTable(con, "iris", iris)

# Wait ~30 seconds or manually refresh schema
```

After refresh, test autocomplete again - you should now see both `mtcars` and `iris` tables.

### Step 7: Test Error Handling

**No Connection Test:**

1. Restart R console (or close `con`)
2. Try to refresh schema
3. Should see: "No DBI connection found in R session"
4. Autocomplete should gracefully degrade

**Reconnect:**

```r
con <- dbConnect(duckdb::duckdb(), dbdir = "test.duckdb")
```

Wait 30 seconds or refresh - autocomplete should work again.

## Expected Behavior

### Positron Mode (New!)

- ✅ Schema from R session (no lock conflicts)
- ✅ Auto-refresh every 30 seconds
- ✅ Queries execute in R console
- ✅ No manual database connection needed
- ✅ Works with any DBI connection (not just DuckDB!)

### VSCode Mode (Legacy)

- ✅ Direct DuckDB connection via Node.js
- ✅ Manual schema refresh
- ✅ Results in webview panel
- ✅ DuckDB-specific

## Troubleshooting

### "Not running in Positron" Error

**Check:** Look at Output panel when extension activates. Should say "Running in Positron mode".

**Fix:** Make sure you're running in actual Positron, not VSCode. Check that `vscode.env.appName` includes "Positron".

### "No active R session found"

**Check:** Open the Console tab in Positron. You should see an R prompt.

**Fix:** Start an R console: Console → Start R Console

### "No DBI connection found"

**Check:** In R console, run:
```r
exists("con")
inherits(con, "DBIConnection")
```

**Fix:** Create a connection:
```r
library(DBI)
con <- dbConnect(duckdb::duckdb(), "test.duckdb")
```

### Schema Not Refreshing

**Check:** Output panel for refresh messages.

**Fix:** Manually trigger: Command Palette → "R SQL: Refresh Database Schema"

### Autocomplete Not Appearing

**Checklist:**
1. ✅ Are you inside a string? (between `"` quotes)
2. ✅ Is the string in a DBI function? (`dbGetQuery`, `dbExecute`, etc.)
3. ✅ Is schema loaded? (Check command: Refresh Schema)
4. ✅ Try typing a character and then press Ctrl+Space

## Advanced Testing

### Test with Different Databases

The Positron integration works with **any DBI connection**:

```r
# PostgreSQL
con <- dbConnect(RPostgres::Postgres(),
                 dbname = "mydb",
                 host = "localhost")

# SQLite
con <- dbConnect(RSQLite::SQLite(), "mydb.sqlite")

# MySQL
con <- dbConnect(RMariaDB::MariaDB(),
                 dbname = "mydb",
                 host = "localhost")
```

After creating any of these connections, the extension should work identically!

### Test with Multiple Tables

```r
# Add more test tables
dbWriteTable(con, "iris", iris)
dbWriteTable(con, "cars", cars)
dbWriteTable(con, "pressure", pressure)

# Refresh and test
# Should see all tables in autocomplete
```

### Test with Complex Queries

```r
query <- dbGetQuery(con, "
  SELECT
    m.mpg,
    m.cyl,
    COUNT(*) as count
  FROM mtcars m
  WHERE m.mpg > 20
  GROUP BY m.mpg, m.cyl
  ORDER BY m.mpg DESC
")
```

Place cursor at various positions in the query and test autocomplete:
- After `SELECT` - should see columns
- After `FROM` - should see tables
- After `m.` - should see mtcars columns

## Success Criteria

✅ Extension activates in Positron mode
✅ Schema discovered from R session
✅ Autocomplete shows columns from mtcars
✅ Autocomplete shows tables when typing FROM
✅ Dot notation filters to specific table
✅ Glue strings work correctly
✅ Queries execute in R console
✅ Schema auto-refreshes
✅ No database lock conflicts

## Next Steps

Once basic testing is complete, you can:

1. Package the extension: `npm run package`
2. Install the .vsix in Positron
3. Use it with your real projects!

## Feedback

If you encounter issues, check:
1. Output panel (View → Output → "R SQL Editor")
2. Developer Console (Help → Toggle Developer Tools)
3. R console for error messages

The extension should gracefully handle edge cases and provide helpful error messages.
