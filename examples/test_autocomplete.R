# Autocomplete Manual Test Cases
# Open this file in Positron with the extension enabled.
# Place cursor at each [CURSOR] marker and verify autocomplete triggers.
# Lines marked [NO AUTOCOMPLETE] should NOT offer SQL completions.

library(DBI)
library(duckdb)
library(glue)
library(duckplyr)

con <- dbConnect(duckdb(), ":memory:")
dbWriteTable(con, "penguins", penguins)
# ---------------------------------------------------------------------------
# 1. Single-line strings (the bug-prone case)
# ---------------------------------------------------------------------------

# 1a. Cursor at end of keyword — should suggest SELECT, SET, etc.
dbExecute(con, "SEL")

# 1b. Cursor after space — should suggest keywords/tables
dbGetQuery(con, "SELECT bill_dep FROM")

# 1c. Cursor mid-string
dbSendQuery(con, "SELECT x FROM ")

# 1d. Named sql parameter
dbGetQuery(con, sql = "SELECT ")


# ---------------------------------------------------------------------------
# 2. Multi-line: opening quote on same line as function
# ---------------------------------------------------------------------------

dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name,
    [should complete here]
  FROM customers
  WHERE country = 'USA'
"
)

dbExecute(con, "CREATE TABLE t (id INTEGER, val TEXT)")


# ---------------------------------------------------------------------------
# 3. Multi-line: Air formatter style (quote on its own line)
# ---------------------------------------------------------------------------

dbGetQuery(
  con,
  "
  SELECT
    order_id,
    amount, 
    bill_dep
  FROM orders
  WHERE status = 'completed'
  ORDER BY amount DESC
"
)

dbExecute(
  con,
  "
  INSERT INTO t VALUES (1, 'hello')
"
)


# ---------------------------------------------------------------------------
# 4. Namespace-qualified DBI calls
# ---------------------------------------------------------------------------

DBI::dbGetQuery(con, "SELECT COUNT(*) FROM orders")

DBI::dbExecute(
  con,
  "
  DELETE FROM t WHERE id = 1
"
)


# ---------------------------------------------------------------------------
# 5. dbplyr sql()
# ---------------------------------------------------------------------------

sql("SELECT 1 AS one")

dbplyr::sql("SELECT CURRENT_DATE")


# ---------------------------------------------------------------------------
# 6. glue_sql with interpolations
# ---------------------------------------------------------------------------

tbl <- "customers"
col <- "name"

# Autocomplete should work outside {} but NOT inside {}
glue_sql("SELECT {`col`} FROM {`tbl`} WHERE customer_id > {min_id}", .con = con)

glue_sql(
  "   SELECT customer_id,
              {`col`},
              UPPER(email) AS upper_email
         FROM {`tbl`}
     ORDER BY customer_id",
  .con = con
)


# ---------------------------------------------------------------------------
# 7. glue_data_sql
# ---------------------------------------------------------------------------

params <- list(status = "completed")
glue_data_sql(
  params,
  "SELECT * FROM orders WHERE status = {status}",
  .con = con
)


# ---------------------------------------------------------------------------
# 8. duckplyr functions
# ---------------------------------------------------------------------------

read_sql_duckdb("SELECT * FROM duckdb_settings()")

read_sql_duckdb(
  sql = "SELECT name, value FROM duckdb_settings() WHERE name LIKE '%thread%'"
)

duckplyr::read_sql_duckdb("SELECT 42 AS answer")

db_exec("SET threads TO 4")

duckplyr::db_exec(sql = "SET memory_limit = '2GB'")


# ---------------------------------------------------------------------------
# 9. Named arguments that are NOT SQL — should NOT autocomplete
# ---------------------------------------------------------------------------

# [NO AUTOCOMPLETE] — "prudence" is not a SQL parameter
read_sql_duckdb("SELECT 1", prudence = "thrifty")

# [NO AUTOCOMPLETE] — ".envir" is not SQL
glue_sql("SELECT 1", .con = con, .envir = parent.frame())


# ---------------------------------------------------------------------------
# 10. Non-SQL function calls — should NOT autocomplete
# ---------------------------------------------------------------------------

# [NO AUTOCOMPLETE] — paste is not a recognised SQL function
paste("SELECT * FROM fake")

# [NO AUTOCOMPLETE]
cat("SELECT 1\n")

# [NO AUTOCOMPLETE] — print is not a recognised SQL function
print("DROP TABLE students")


# ---------------------------------------------------------------------------
# 11. Comments — should never autocomplete
# ---------------------------------------------------------------------------

# SELECT * FROM orders [NO AUTOCOMPLETE]
dbGetQuery(con, "SELECT 1") # SELECT [NO AUTOCOMPLETE]


# ---------------------------------------------------------------------------
# 12. DuckDB function completions
# ---------------------------------------------------------------------------

# Typing a function name should show signature + docs
dbGetQuery(con, "SELECT DATE_TRUNC('month', order_date) FROM orders")
dbGetQuery(con, "SELECT STRING_AGG(name, ', ') FROM customers")
dbGetQuery(con, "SELECT COALESCE(amount, 0) FROM orders")
dbGetQuery(con, "SELECT LIST_VALUE(1, 2, 3)")


# ---------------------------------------------------------------------------
# Clean up
# ---------------------------------------------------------------------------

dbDisconnect(con, shutdown = TRUE)
