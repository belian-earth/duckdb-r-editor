# R SQL Editor Demo
# This file demonstrates the SQL autocomplete features

library(DBI)
library(duckdb)

# Connect to DuckDB
con <- dbConnect(duckdb(), ":memory:")


dbExecute(con, "SEL[no suggestions here]")
dbExecute(
  con,
  "SELECT this
FROM that
WHEN"
)
dbExecute(
  con,
  "SEL[no suggestions here]"
)

dbExecute(
  con,
  "
SELECT x FROM y WHERE"
)


# Create sample tables
dbExecute(
  con,
  "
  CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name VARCHAR,
    email VARCHAR,
    created_at TIMESTAMP,
    country VARCHAR
  )
"
)

dbExecute(
  con,
  "
  CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    amount DECIMAL(10, 2),
    order_date DATE,
    status VARCHAR
  )
"
)

dbExecute(
  con,
  "
  CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    product_name VARCHAR,
    category VARCHAR,
    price DECIMAL(10, 2)
  )
"
)

# Insert sample data
dbExecute(
  con,
  "
  INSERT INTO customers VALUES
    (1, 'Alice Smith', 'alice@example.com', '2024-01-15', 'USA'),
    (2, 'Bob Jones', 'bob@example.com', '2024-02-20', 'UK'),
    (3, 'Carol White', 'carol@example.com', '2024-03-10', 'Canada')
"
)

dbExecute(
  con,
  "
  INSERT INTO orders VALUES
    (1, 1, 150.00, '2024-06-01', 'completed'),
    (2, 1, 200.00, '2024-06-15', 'completed'),
    (3, 2, 75.00, '2024-06-20', 'pending'),
    (4, 3, 300.00, '2024-07-01', 'completed')
"
)

# Now try typing SQL queries below - you'll get autocomplete!

# Example 1: Basic SELECT with autocomplete
# Try typing "SELECT " and see table/column suggestions
customers <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    name,
    email
  FROM customers
  WHERE created_at > CURRENT_DATE - INTERVAL '6 months'
"
)

# Example 2: JOIN with autocomplete
# Try typing "customers." to see customer columns
# Try typing "orders." to see order columns
result <- dbGetQuery(
  con,
  "
  SELECT
    c.customer_id,
    c.name,
    COUNT(*) as order_count,
    SUM(o.amount) as total_spent
  FROM customers c
  LEFT JOIN orders o ON c.customer_id = o.customer_id
  GROUP BY c.customer_id, c.name
  ORDER BY total_spent DESC
"
)

# Example 3: Window functions
# Try typing "ROW_NUMBER" to see function signature and examples
ranked <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    order_date,
    amount,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date) as order_number,
    SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date) as running_total
  FROM orders
"
)

# Example 4: Date functions
# Try typing "DATE_TRUNC" or "EXTRACT" to see examples
date_analysis <- dbGetQuery(
  con,
  "
  SELECT
    DATE_TRUNC('month', order_date) as month,
    EXTRACT(YEAR FROM order_date) as year,
    COUNT(*) as orders,
    SUM(amount) as revenue
  FROM orders
  GROUP BY DATE_TRUNC('month', order_date), EXTRACT(YEAR FROM order_date)
  ORDER BY month
"
)

# Example 5: String functions
# Try typing "CONCAT" or "UPPER" to see function details
formatted <- dbGetQuery(
  con,
  "
  SELECT
    customer_id,
    CONCAT(UPPER(name), ' <', LOWER(email), '>') as formatted_contact,
    LENGTH(name) as name_length,
    SUBSTRING(email, 1, POSITION('@' IN email) - 1) as username
  FROM customers
"
)

# Example 6: Conditional logic
# Try typing "CASE" to see the syntax
categorized <- dbGetQuery(
  con,
  "
  SELECT
    order_id,
    amount,
    CASE
      WHEN amount < 100 THEN 'Small'
      WHEN amount < 200 THEN 'Medium'
      ELSE 'Large'
    END as order_size,
    COALESCE(status, 'unknown') as order_status
  FROM orders
"
)

# Example 7: Aggregation
# Try typing aggregate function names for documentation
summary <- dbGetQuery(
  con,
  "
  SELECT
    country,
    COUNT(*) as customer_count,
    AVG(DATEDIFF('day', created_at, CURRENT_DATE)) as avg_days_since_signup,
    MIN(created_at) as first_signup,
    MAX(created_at) as latest_signup,
    STRING_AGG(name, ', ') as customer_names
  FROM customers
  GROUP BY country
  HAVING COUNT(*) > 0
"
)

# Clean up
dbDisconnect(con, shutdown = TRUE)
