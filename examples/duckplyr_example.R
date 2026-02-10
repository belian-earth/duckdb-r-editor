# Example demonstrating duckplyr SQL support in DuckDB R Editor

library(duckplyr)

# read_sql_duckdb() - Query DuckDB settings
settings <- read_sql_duckdb("SELECT * FROM duckdb_settings()")

# read_sql_duckdb() with named parameter
result <- read_sql_duckdb(
  sql = "SELECT name, value
         FROM duckdb_settings()
         WHERE name LIKE '%memory%'"
)

# Multiline SQL query
data <- read_sql_duckdb(
  "
  SELECT 
    table_name,
    column_name,
    data_type,
  FROM 
  FROM information_schema.columns
  ORDER BY table_name, ordinal_position
  ORD
  ORDER 
"
)

# Using namespace prefix
duckplyr_data <- duckplyr::read_sql_duckdb(
  sql = "FROM duckdb_settings()"
)

# Named arguments should NOT be highlighted (these are NOT SQL)
# For example, this prudence parameter should not get SQL highlighting:
result2 <- read_sql_duckdb(
  "SELECT 1 as test",
  prudence = "thrifty"
)

# db_exec() - Execute configuration statements
db_exec("SET threads TO 2")

# db_exec() with named parameter
db_exec(sql = "SET memory_limit = '1GB'")

# db_exec() with PRAGMA statements
db_exec("PRAGMA database_size")

# Multiline configuration
db_exec(
  "
  SET preserve_insertion_order = true;
  SET enable_progress_bar = false;
"
)

# Using namespace prefix
duckplyr::db_exec(sql = "ATTACH 'data.db' AS data_db")
