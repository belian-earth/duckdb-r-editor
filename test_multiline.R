library(DBI)
library(duckdb)

# Connect to database
con <- dbConnect(duckdb(), "test.duckdb")

# Test Case 1: Multi-line SQL with cursor on different lines
result1 <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name,
    email,
    DATE_TRUNC('day', created_at) as signup_date
  FROM customers
  WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
  ORDER BY created_at DESC
"
)

# Test Case 2: Glue multi-line with interpolations
library(glue)
table_name <- "customers"
min_date <- "2024-01-01"

result2 <- dbGetQuery(
  con,
  glue_sql(
    "
  SELECT
    customer_id,
    name,
    DATE_TRUNC('month', created_at) as signup_month
  FROM {`table_name`}
  WHERE created_at > {min_date}
  ORDER BY created_at DESC
",
    .con = con
  )
)

# Test Case 3: Deeply nested multi-line query
result3 <- dbGetQuery(
  con,
  "
  WITH monthly_sales AS (
    SELECT
      DATE_TRUNC('month', order_date) as month,
      customer_id,
      SUM(amount) as total_amount,
      COUNT(*) as order_count
    FROM orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '1 year'
    GROUP BY month, customer_id
  )
  SELECT
    c.name,
    c.email,
    ms.month,
    ms.total_amount,
    ms.order_count,
    AVG(ms.total_amount) OVER (
      PARTITION BY c.customer_id
      ORDER BY ms.month
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as rolling_avg
  FROM customers c
  JOIN monthly_sales ms ON c.customer_id = ms.customer_id
  WHERE ms.total_amount > 1000
  ORDER BY ms.month DESC, ms.total_amount DESC
"
)

# Test Case 4: Single line (should still work)
result4 <- dbGetQuery(con, "SELECT * FROM customers LIMIT 10")

dbDisconnect(con)
