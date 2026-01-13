# R SQL Editor with Glue Support Demo
# This file demonstrates SQL autocomplete with glue package interpolation

library(DBI)
library(duckdb)
library(glue)

# Connect to DuckDB
con <- dbConnect(duckdb(), ":memory:")

# Create sample tables
dbExecute(con, "
  CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name VARCHAR,
    email VARCHAR,
    created_at TIMESTAMP,
    country VARCHAR
  )
")

dbExecute(con, "
  CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    amount DECIMAL(10, 2),
    order_date DATE,
    status VARCHAR
  )
")

# Insert sample data
dbExecute(con, "
  INSERT INTO customers VALUES
    (1, 'Alice Smith', 'alice@example.com', '2024-01-15', 'USA'),
    (2, 'Bob Jones', 'bob@example.com', '2024-02-20', 'UK'),
    (3, 'Carol White', 'carol@example.com', '2024-03-10', 'Canada')
")

dbExecute(con, "
  INSERT INTO orders VALUES
    (1, 1, 150.00, '2024-06-01', 'completed'),
    (2, 1, 200.00, '2024-06-15', 'completed'),
    (3, 2, 75.00, '2024-06-20', 'pending'),
    (4, 3, 300.00, '2024-07-01', 'completed')
")

# ============================================================================
# GLUE INTEGRATION EXAMPLES
# ============================================================================

# Example 1: Basic glue interpolation
# R variables can be interpolated with {}
# SQL autocomplete still works outside the {}!
table_name <- "customers"

result1 <- dbGetQuery(con, glue("
  SELECT
    customer_id,        -- Autocomplete works here!
    name,              -- Column suggestions!
    email
  FROM {table_name}    -- R variable interpolated
  WHERE country = 'USA'
"))

# Example 2: glue_sql with proper SQL quoting
# glue_sql is safer for SQL - it handles quoting correctly
min_amount <- 100
status_filter <- "completed"

result2 <- dbGetQuery(con, glue_sql("
  SELECT
    o.order_id,
    o.amount,
    c.name,
    DATE_TRUNC('day', o.order_date) as order_day   -- Function autocomplete!
  FROM orders o
  JOIN {`table_name`} c ON o.customer_id = c.customer_id
  WHERE o.amount > {min_amount}
    AND o.status = {status_filter}
", .con = con))

# Example 3: Dynamic column selection
columns <- c("customer_id", "name", "email")
column_list <- paste(columns, collapse = ", ")

result3 <- dbGetQuery(con, glue("
  SELECT {column_list}
  FROM customers
  WHERE created_at > CURRENT_DATE - INTERVAL '6 months'
"))

# Example 4: Complex query with multiple interpolations
country_filter <- "USA"
days_ago <- 30

result4 <- dbGetQuery(con, glue_sql("
  SELECT
    c.name,
    COUNT(*) as order_count,           -- Aggregate function autocomplete!
    SUM(o.amount) as total_amount,     -- More function suggestions!
    AVG(o.amount) as avg_amount,
    STRING_AGG(                         -- DuckDB-specific functions work!
      CAST(o.order_id AS VARCHAR),
      ', '
    ) as order_ids
  FROM customers c
  LEFT JOIN orders o ON c.customer_id = o.customer_id
  WHERE c.country = {country_filter}
    AND (o.order_date > CURRENT_DATE - INTERVAL '{days_ago} days'
         OR o.order_date IS NULL)
  GROUP BY c.customer_id, c.name
  HAVING COUNT(*) > 0
  ORDER BY total_amount DESC
", .con = con))

# Example 5: Using glue_data for row-wise operations
filters <- data.frame(
  country = c("USA", "UK"),
  min_amount = c(100, 50)
)

# Note: In glue strings, you can still use SQL functions!
queries <- glue_data(filters, "
  SELECT
    customer_id,
    name,
    UPPER(country) as country_upper    -- String functions autocomplete!
  FROM customers
  WHERE country = '{country}'
")

# Example 6: Window functions with glue
partition_column <- "customer_id"
order_column <- "order_date"

result6 <- dbGetQuery(con, glue_sql("
  SELECT
    order_id,
    customer_id,
    amount,
    order_date,
    ROW_NUMBER() OVER (                -- Window function autocomplete!
      PARTITION BY {`partition_column`}
      ORDER BY {`order_column`}
    ) as order_number,
    LAG(amount, 1) OVER (              -- More window functions!
      PARTITION BY {`partition_column`}
      ORDER BY {`order_column`}
    ) as previous_amount
  FROM orders
", .con = con))

# Example 7: Conditional table selection
use_archived <- FALSE
orders_table <- if (use_archived) "orders_archive" else "orders"

result7 <- dbGetQuery(con, glue("
  SELECT
    order_id,
    amount,
    EXTRACT(YEAR FROM order_date) as year,    -- Date functions!
    EXTRACT(MONTH FROM order_date) as month
  FROM {orders_table}
  WHERE status = 'completed'
"))

# Example 8: Building WHERE clauses dynamically
additional_filter <- "AND amount > 100"

result8 <- dbGetQuery(con, glue("
  SELECT
    *,
    ROUND(amount, 2) as rounded_amount    -- Math functions autocomplete!
  FROM orders
  WHERE status = 'completed'
    {additional_filter}
"))

# Example 9: CTE with glue
cte_name <- "recent_orders"
days_back <- 60

result9 <- dbGetQuery(con, glue_sql("
  WITH {`cte_name`} AS (
    SELECT
      customer_id,
      COUNT(*) as order_count,
      SUM(amount) as total
    FROM orders
    WHERE order_date > CURRENT_DATE - INTERVAL '{days_back} days'
    GROUP BY customer_id
  )
  SELECT
    c.name,
    COALESCE(r.order_count, 0) as orders,    -- Conditional functions!
    COALESCE(r.total, 0.0) as total_spent
  FROM customers c
  LEFT JOIN {`cte_name`} r ON c.customer_id = r.customer_id
  ORDER BY total_spent DESC
", .con = con))

# Example 10: Array and JSON operations with glue
list_column <- "tags"

result10 <- dbGetQuery(con, glue("
  SELECT
    order_id,
    LIST_VALUE('pending', 'processing', 'completed') as status_options,  -- Array functions!
    ARRAY_LENGTH(LIST_VALUE(1, 2, 3)) as array_len
  FROM orders
  LIMIT 5
"))

# ============================================================================
# KEY FEATURES DEMONSTRATED:
# ============================================================================
#
# 1. ✅ SQL autocomplete works in glue() and glue_sql() strings
# 2. ✅ Autocomplete is disabled inside {} interpolation blocks
# 3. ✅ R expressions inside {} get normal R autocomplete
# 4. ✅ All DuckDB functions still have autocomplete and documentation
# 5. ✅ Table and column names are suggested from connected database
# 6. ✅ Syntax validation accounts for {} placeholders
# 7. ✅ Works with glue(), glue_sql(), glue_data(), glue_data_sql()
#
# Just start typing SQL and enjoy the DuckDB CLI experience inline!
# ============================================================================

# Clean up
dbDisconnect(con, shutdown = TRUE)
