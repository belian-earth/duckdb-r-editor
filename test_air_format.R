library(DBI)
library(duckdb)
library(glue)

# Connect to database
con <- dbConnect(duckdb(), "test.duckdb")

# ===== Test: Commented code should NOT be highlighted =====
# This line is commented out and should not have SQL highlighting:
# result_commented <- dbGetQuery(con, "SELECT * FROM customers WHERE id > 100")

# Air-formatted: dbGetQuery with string on separate line
result1 <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name,
    email
  FROM customers
  WHERE id > 100
"
)

# Air-formatted: sql() with string on separate line
result2 <- sql(
  "
  SELECT *
  FROM orders
  WHERE amount > 1000
"
)

# Air-formatted: glue_sql with string on separate line
table_name <- "customers"
result3 <- glue_sql(
  "
  SELECT *
  FROM {`table_name`}
  WHERE active = TRUE
",
  .con = con
)

# Air-formatted: dbExecute with string on separate line
dbExecute(
  con,
  "
  CREATE TABLE test_table (
    id INTEGER,
    name VARCHAR
  )
"
)

# ===== Test: Table names vs columns should have different colors =====
result4 <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name,
    email
  FROM customers
  JOIN orders ON customers.id = orders.customer_id
  WHERE orders.amount > 1000
"
)

dbDisconnect(con)
