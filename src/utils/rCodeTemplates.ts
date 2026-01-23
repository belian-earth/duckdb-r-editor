import { R_TEMP_VAR_PREFIX } from '../constants';

/**
 * R code template utilities for executing R code via Positron API
 * Centralizes all R code patterns used by the extension
 */
export class RCodeTemplates {
    /**
     * Generate R code to discover all DuckDB connections in the global environment
     * Finds all objects that inherit from "duckdb_connection" and extracts metadata
     *
     * @param outputFilePath Path to write JSON results (R-compatible format)
     * @returns R code string that discovers connections and writes to file
     */
    static discoverConnections(outputFilePath: string): string {
        return `
tryCatch({
    ${R_TEMP_VAR_PREFIX}all_objs <- ls(envir = .GlobalEnv)
    ${R_TEMP_VAR_PREFIX}connections <- list()

    for (${R_TEMP_VAR_PREFIX}obj_name in ${R_TEMP_VAR_PREFIX}all_objs) {
        ${R_TEMP_VAR_PREFIX}tmp_obj <- get(${R_TEMP_VAR_PREFIX}obj_name, envir = .GlobalEnv)
        if (inherits(${R_TEMP_VAR_PREFIX}tmp_obj, "duckdb_connection")) {
            # Get database path
            ${R_TEMP_VAR_PREFIX}db_path <- tryCatch({
                ${R_TEMP_VAR_PREFIX}tmp_obj@driver@dbdir
            }, error = function(e) {
                ":memory:"
            })

            # Count tables
            ${R_TEMP_VAR_PREFIX}table_count <- tryCatch({
                length(DBI::dbListTables(${R_TEMP_VAR_PREFIX}tmp_obj))
            }, error = function(e) {
                0
            })

            ${R_TEMP_VAR_PREFIX}connections[[length(${R_TEMP_VAR_PREFIX}connections) + 1]] <- list(
                name = ${R_TEMP_VAR_PREFIX}obj_name,
                dbPath = ${R_TEMP_VAR_PREFIX}db_path,
                tableCount = ${R_TEMP_VAR_PREFIX}table_count
            )
        }
    }

    # Write to file (no console output in silent mode)
    ${R_TEMP_VAR_PREFIX}temp_file <- "${outputFilePath}"

    if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::write_json(${R_TEMP_VAR_PREFIX}connections, ${R_TEMP_VAR_PREFIX}temp_file, auto_unbox = TRUE)
    } else {
        ${R_TEMP_VAR_PREFIX}json_output <- paste0("[", paste(sapply(${R_TEMP_VAR_PREFIX}connections, function(c) {
            sprintf('{"name":"%s","dbPath":"%s","tableCount":%d}',
                c$name, c$dbPath, c$tableCount)
        }), collapse = ","), "]")
        writeLines(${R_TEMP_VAR_PREFIX}json_output, ${R_TEMP_VAR_PREFIX}temp_file)
    }

    # Cleanup: Remove all temporary variables
    rm(${R_TEMP_VAR_PREFIX}all_objs, ${R_TEMP_VAR_PREFIX}connections, ${R_TEMP_VAR_PREFIX}obj_name, ${R_TEMP_VAR_PREFIX}tmp_obj, ${R_TEMP_VAR_PREFIX}db_path, ${R_TEMP_VAR_PREFIX}table_count, ${R_TEMP_VAR_PREFIX}temp_file)
    if (exists("${R_TEMP_VAR_PREFIX}json_output")) rm(${R_TEMP_VAR_PREFIX}json_output)

    invisible(NULL)
}, error = function(e) {
    # Silent error - write empty array to file
    writeLines("[]", "${outputFilePath}")
    invisible(NULL)
})`.trim();
    }

    /**
     * Generate R code to refresh schema information for a connection
     * Queries information_schema to get table and column metadata
     *
     * @param connectionName Name of R connection variable in global environment
     * @param outputFilePath Path to write JSON results (R-compatible format)
     * @returns R code string that queries schema and writes to file
     */
    static refreshSchema(connectionName: string, outputFilePath: string): string {
        return `
tryCatch({
    # Get the specific connection object
    if (!exists("${connectionName}", envir = .GlobalEnv)) {
        stop("Connection '${connectionName}' not found in R session")
    }

    ${R_TEMP_VAR_PREFIX}tmp_conn <- get("${connectionName}", envir = .GlobalEnv)

    if (!inherits(${R_TEMP_VAR_PREFIX}tmp_conn, "duckdb_connection")) {
        stop("Object '${connectionName}' is not a DuckDB connection")
    }

    # Get schema information
    if (!requireNamespace("DBI", quietly = TRUE)) {
        stop("DBI package not available")
    }

    # Check if connection is still valid
    if (!DBI::dbIsValid(${R_TEMP_VAR_PREFIX}tmp_conn)) {
        stop("Connection '${connectionName}' is no longer valid. It may have been closed.")
    }

    tables <- DBI::dbListTables(${R_TEMP_VAR_PREFIX}tmp_conn)
    result <- list()

    for (table in tables) {
        tryCatch({
            col_info <- DBI::dbGetQuery(${R_TEMP_VAR_PREFIX}tmp_conn, sprintf(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '%s' AND table_schema = 'main' ORDER BY ordinal_position",
                table
            ))

            for (i in 1:nrow(col_info)) {
                result[[length(result) + 1]] <- list(
                    table_name = table,
                    column_name = col_info$column_name[i],
                    data_type = col_info$data_type[i],
                    is_nullable = col_info$is_nullable[i]
                )
            }
        }, error = function(e) {
            # Silently skip tables that can't be queried
        })
    }

    # Write to file (no console output in silent mode)
    schema_file_path <- "${outputFilePath}"

    if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::write_json(result, schema_file_path, auto_unbox = TRUE, pretty = TRUE)
    } else {
        json_output <- if (length(result) == 0) {
            "[]"
        } else {
            paste0("[", paste(sapply(result, function(r) {
                sprintf('{"table_name":"%s","column_name":"%s","data_type":"%s","is_nullable":"%s"}',
                    r$table_name, r$column_name, r$data_type, r$is_nullable)
            }), collapse = ","), "]")
        }
        writeLines(json_output, schema_file_path)
    }

    # Cleanup: Remove temporary connection reference
    rm(${R_TEMP_VAR_PREFIX}tmp_conn)

    invisible(NULL)
}, error = function(e) {
    stop(e$message)
})`.trim();
    }

    /**
     * Generate R code to refresh DuckDB function information for a connection
     * Queries duckdb_functions() system table to get all available functions
     *
     * @param connectionName Name of R connection variable in global environment
     * @param outputFilePath Path to write JSON results (R-compatible format)
     * @returns R code string that queries functions and writes to file
     */
    static refreshFunctions(connectionName: string, outputFilePath: string): string {
        return `
tryCatch({
    if (!exists("${connectionName}", envir = .GlobalEnv)) {
        stop("Connection '${connectionName}' not found in R session")
    }

    ${R_TEMP_VAR_PREFIX}tmp_conn <- get("${connectionName}", envir = .GlobalEnv)

    if (!inherits(${R_TEMP_VAR_PREFIX}tmp_conn, "duckdb_connection")) {
        stop("Object '${connectionName}' is not a DuckDB connection")
    }

    # Check if connection is still valid
    if (!DBI::dbIsValid(${R_TEMP_VAR_PREFIX}tmp_conn)) {
        stop("Connection '${connectionName}' is no longer valid. It may have been closed.")
    }

    # Query all functions from DuckDB
    ${R_TEMP_VAR_PREFIX}functions <- DBI::dbGetQuery(${R_TEMP_VAR_PREFIX}tmp_conn, "SELECT * FROM duckdb_functions()")

    # Write to file
    ${R_TEMP_VAR_PREFIX}func_file <- "${outputFilePath}"

    if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::write_json(${R_TEMP_VAR_PREFIX}functions, ${R_TEMP_VAR_PREFIX}func_file, auto_unbox = TRUE, pretty = FALSE)
    } else {
        # Fallback: write simplified JSON
        ${R_TEMP_VAR_PREFIX}json <- paste0("[", paste(apply(${R_TEMP_VAR_PREFIX}functions, 1, function(row) {
            sprintf('{"function_name":"%s","function_type":"%s","description":"%s","return_type":"%s"}',
                row["function_name"], row["function_type"],
                gsub('"', '\\\\"', row["description"]), row["return_type"])
        }), collapse = ","), "]")
        writeLines(${R_TEMP_VAR_PREFIX}json, ${R_TEMP_VAR_PREFIX}func_file)
    }

    rm(${R_TEMP_VAR_PREFIX}tmp_conn, ${R_TEMP_VAR_PREFIX}functions, ${R_TEMP_VAR_PREFIX}func_file)
    if (exists("${R_TEMP_VAR_PREFIX}json")) rm(${R_TEMP_VAR_PREFIX}json)

    invisible(NULL)
}, error = function(e) {
    stop(e$message)
})`.trim();
    }
}
