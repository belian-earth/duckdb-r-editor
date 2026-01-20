import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { SQLCompletionProvider } from './completionProvider';
import { PositronSchemaProvider } from './positronSchemaProvider';
import { DuckDBFunctionProvider } from './functionProvider';
import { SQLDiagnosticsProvider } from './diagnosticsProvider';
import { DocumentCache } from './documentCache';
import { SQLSemanticTokenProvider } from './semanticTokenProvider';
import { SQLBackgroundDecorator } from './sqlBackgroundDecorator';
import { tryAcquirePositronApi } from '@posit-dev/positron';

// Module-level state
let schemaProvider: PositronSchemaProvider | undefined;
let functionProvider: DuckDBFunctionProvider | undefined;
let diagnosticsProvider: SQLDiagnosticsProvider;
let outputChannel: vscode.OutputChannel;
let documentCache: DocumentCache;
let semanticTokenProvider: SQLSemanticTokenProvider;
let sqlBackgroundDecorator: SQLBackgroundDecorator;
let previousTableCount: number = 0;
let previousFunctionCount: number = 0;
let shownEmptyDbWarning: boolean = false;

// Constants
const DEBOUNCE_DELAY_MS = 1500;
const SCHEMA_MODIFY_PATTERNS = [
  /dbExecute\s*\(/i,                    // dbExecute(con, ...)
  /dbWriteTable\s*\(/i,                 // dbWriteTable(con, ...)
  /dbRemoveTable\s*\(/i,                // dbRemoveTable(con, ...)
  /dbCreateTable\s*\(/i,                // dbCreateTable(con, ...)
  /\bCREATE\s+(TABLE|VIEW|INDEX)/i,    // CREATE TABLE/VIEW/INDEX
  /\bDROP\s+(TABLE|VIEW|INDEX)/i,      // DROP TABLE/VIEW/INDEX
  /\bALTER\s+TABLE/i,                   // ALTER TABLE
  /\bTRUNCATE\s+TABLE/i,                // TRUNCATE TABLE
];

const EXTENSION_LOAD_PATTERNS = [
  /\bINSTALL\s+\w+/i,                   // INSTALL spatial
  /\bLOAD\s+\w+/i,                      // LOAD spatial
];

interface RConnectionInfo {
  name: string;
  dbPath: string;
  tableCount: number;
}

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('DuckDB R Editor');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('='.repeat(60));
  outputChannel.appendLine('DuckDB R Editor - Positron Edition');
  outputChannel.appendLine('='.repeat(60));

  // Check for Positron API (REQUIRED)
  const positronApi = tryAcquirePositronApi();
  if (!positronApi) {
    const errorMsg = 'DuckDB R Editor requires Positron IDE. This extension will not work in VS Code.';
    outputChannel.appendLine('✗ ' + errorMsg);
    vscode.window.showErrorMessage(errorMsg);
    return;
  }

  outputChannel.appendLine('✓ Positron API detected');

  // Get configuration settings
  const config = vscode.workspace.getConfiguration('duckdb-r-editor');

  // Initialize function provider (Node.js DuckDB for function discovery)
  outputChannel.appendLine('Initializing function provider...');
  functionProvider = new DuckDBFunctionProvider();

  // Load default extensions from settings
  const defaultExtensions = config.get<string[]>('defaultExtensions', []);

  if (defaultExtensions.length > 0) {
    outputChannel.appendLine(`Loading default extensions: ${defaultExtensions.join(', ')}`);
    await functionProvider.loadDefaultExtensions(defaultExtensions);
  } else {
    await functionProvider.refreshFunctions();
  }

  const funcCount = functionProvider.getAllFunctions().length;
  outputChannel.appendLine(`✓ Discovered ${funcCount} DuckDB functions`);
  context.subscriptions.push(functionProvider);

  // Schema provider will be initialized when user connects to a database
  outputChannel.appendLine('');
  outputChannel.appendLine('Ready! Use "DuckDB R Editor: Connect to DuckDB Database" to get started.');
  outputChannel.appendLine('Note: You must have an active R DuckDB connection in your session.');
  outputChannel.appendLine('='.repeat(60));

  // Initialize diagnostics provider
  outputChannel.appendLine('Initializing diagnostics provider');
  diagnosticsProvider = new SQLDiagnosticsProvider();

  // Initialize document cache for performance and stability
  outputChannel.appendLine('Initializing document cache');
  documentCache = new DocumentCache();

  // Check if semantic highlighting is enabled (default: true)
  const useSemanticHighlighting = config.get<boolean>('useSemanticHighlighting', true);

  if (useSemanticHighlighting) {
    // Register semantic token provider for Air formatter support
    outputChannel.appendLine('Registering semantic token provider for SQL highlighting');
    outputChannel.appendLine('  Supports Air formatter multi-line strings');
    outputChannel.appendLine('  Only highlights SQL content - preserves R syntax highlighting');
    semanticTokenProvider = new SQLSemanticTokenProvider(documentCache);

    const semanticTokenProviderDisposable = vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'r', scheme: 'file' },
      semanticTokenProvider,
      SQLSemanticTokenProvider.getLegend()
    );
    context.subscriptions.push(semanticTokenProviderDisposable);
  } else {
    // Use TextMate grammar injection (fallback)
    outputChannel.appendLine('SQL syntax highlighting using TextMate grammar injection');
    outputChannel.appendLine('  Note: Limited support for Air formatter multi-line strings');
  }

  // Initialize SQL background decorator for visual distinction
  outputChannel.appendLine('Initializing SQL background decorator');
  sqlBackgroundDecorator = new SQLBackgroundDecorator();
  context.subscriptions.push(sqlBackgroundDecorator);
  outputChannel.appendLine('  Theme-aware background colors for SQL strings');

  // Combined provider adapter for completion (schema + functions)
  const combinedProvider = {
    getTableNames: () => schemaProvider?.getTableNames() || [],
    getColumns: (tableName: string) => schemaProvider?.getColumns(tableName) || [],
    getAllColumns: () => schemaProvider?.getAllColumns() || [],
    getFunctionNames: () => functionProvider?.getFunctionNames() || [],
    getFunction: (name: string) => functionProvider?.getFunction(name),
    getAllFunctions: () => functionProvider?.getAllFunctions() || [],
    isConnected: () => schemaProvider?.isConnected() || false
  };

  // Register completion provider for R files
  outputChannel.appendLine('Registering completion provider for R files');
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'r', scheme: 'file' },
    new SQLCompletionProvider(combinedProvider as any),
    '.', // Trigger on dot for table.column
    ' ', // Trigger on space
    '"', // Trigger on quote
    "'", // Trigger on single quote
    'S', 'E', 'F', 'W', 'J', 'O', 'I', // Common SQL keywords
    '*', ',', '=' // SQL operators
  );

  // Register commands
  outputChannel.appendLine('Registering commands: connectDatabase, refreshSchema, executeQuery');
  const connectCommand = vscode.commands.registerCommand(
    'duckdb-r-editor.connectDatabase',
    async () => {
      try {
        // Discover R connections
        outputChannel.appendLine('Discovering DuckDB connections in R session...');
        const connections = await discoverRConnections();

        if (connections.length === 0) {
          vscode.window.showErrorMessage('No DuckDB connections found in R session');
          return;
        }

        // Prioritize "con" at the top
        connections.sort((a, b) => {
          if (a.name === 'con') return -1;
          if (b.name === 'con') return 1;
          return a.name.localeCompare(b.name);
        });

        // Show QuickPick
        const items = connections.map(conn => ({
          label: conn.name,
          description: conn.dbPath,
          detail: `${conn.tableCount} table${conn.tableCount !== 1 ? 's' : ''}`,
          connectionInfo: conn
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select R DuckDB connection',
          title: 'DuckDB R Editor: Choose Connection'
        });

        if (selected) {
          await connectToDatabase(
            selected.connectionInfo.name,
            selected.connectionInfo.dbPath
          );
        }
      } catch (err: any) {
        outputChannel.appendLine(`✗ Failed to discover connections: ${err.message}`);
        vscode.window.showErrorMessage(`Failed to discover R connections: ${err.message}`);
      }
    }
  );

  const disconnectCommand = vscode.commands.registerCommand(
    'duckdb-r-editor.disconnectDatabase',
    async () => {
      if (!schemaProvider || !schemaProvider.isConnected()) {
        vscode.window.showInformationMessage('No active database connection');
        return;
      }

      // Disconnect by disposing the schema provider
      schemaProvider.dispose();
      schemaProvider = undefined;

      // Reset tracking state
      previousTableCount = 0;
      previousFunctionCount = 0;
      shownEmptyDbWarning = false;

      outputChannel.appendLine('✓ Disconnected from database');
      vscode.window.showInformationMessage('Disconnected from database');
    }
  );

  const refreshSchemaCommand = vscode.commands.registerCommand(
    'duckdb-r-editor.refreshSchema',
    refreshSchema
  );

  const loadExtensionCommand = vscode.commands.registerCommand(
    'duckdb-r-editor.loadExtension',
    async () => {
      if (!functionProvider) {
        vscode.window.showErrorMessage('Function provider not initialized');
        return;
      }

      const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter official DuckDB extension name (e.g., spatial, httpfs, json)',
        placeHolder: 'spatial',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Extension name is required';
          }
          return null;
        }
      });

      if (!extensionName) {
        return;
      }

      try {
        await functionProvider.loadExtension(extensionName.trim());
        const funcCount = functionProvider.getAllFunctions().length;
        vscode.window.showInformationMessage(
          `✓ Extension '${extensionName}' loaded! ${funcCount} functions now available for autocomplete.`
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to load extension '${extensionName}': ${err.message}\n\n` +
          `Note: If this is a community extension, load it in your R session instead:\n` +
          `dbExecute(con, "INSTALL ${extensionName} FROM community; LOAD ${extensionName};")`
        );
      }
    }
  );

  // Register diagnostic provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'r', scheme: 'file' },
      diagnosticsProvider
    )
  );

  // Watch for document changes to update diagnostics and invalidate cache
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'r') {
        // Update diagnostics
        diagnosticsProvider.updateDiagnostics(event.document);

        // Invalidate document cache to force re-parse on next access
        documentCache.invalidateDocument(event.document);
      }
    })
  );

  // Clear cache when documents are closed to save memory
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      if (document.languageId === 'r') {
        documentCache.invalidateDocument(document);
      }
    })
  );

  // Add to subscriptions
  context.subscriptions.push(
    completionProvider,
    connectCommand,
    disconnectCommand,
    refreshSchemaCommand,
    loadExtensionCommand
  );

  // Setup auto-refresh on code execution
  if (config.get<boolean>('autoRefreshSchema', true)) {
    setupAutoRefresh(positronApi, context);
    outputChannel.appendLine('✓ Auto-refresh enabled (triggers when code references connection)');
  } else {
    outputChannel.appendLine('Auto-refresh disabled (use manual refresh command)');
  }

  outputChannel.appendLine('Extension activation complete!');
  outputChannel.appendLine('Commands available: "R SQL: Connect to DuckDB Database", "R SQL: Refresh Database Schema"');
}

interface RConnectionInfo {
  name: string;
  dbPath: string;
  tableCount: number;
}

async function discoverRConnections(): Promise<RConnectionInfo[]> {
  const positronApi = tryAcquirePositronApi();
  if (!positronApi) {
    throw new Error('Positron API not available');
  }

  // Create temp file for connections data
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const tempFilePath = path.join(tmpDir, `duckdb-connections-${timestamp}.json`);
  const tempFilePathR = tempFilePath.replace(/\\/g, '/');

  const rCode = `
tryCatch({
    .dbre_all_objs <- ls(envir = .GlobalEnv)
    .dbre_connections <- list()

    for (.dbre_obj_name in .dbre_all_objs) {
        .dbre_tmp_obj <- get(.dbre_obj_name, envir = .GlobalEnv)
        if (inherits(.dbre_tmp_obj, "duckdb_connection")) {
            # Get database path
            .dbre_db_path <- tryCatch({
                .dbre_tmp_obj@driver@dbdir
            }, error = function(e) {
                ":memory:"
            })

            # Count tables
            .dbre_table_count <- tryCatch({
                length(DBI::dbListTables(.dbre_tmp_obj))
            }, error = function(e) {
                0
            })

            .dbre_connections[[length(.dbre_connections) + 1]] <- list(
                name = .dbre_obj_name,
                dbPath = .dbre_db_path,
                tableCount = .dbre_table_count
            )
        }
    }

    # Write to file (no console output in silent mode)
    .dbre_temp_file <- "${tempFilePathR}"

    if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::write_json(.dbre_connections, .dbre_temp_file, auto_unbox = TRUE)
    } else {
        .dbre_json_output <- paste0("[", paste(sapply(.dbre_connections, function(c) {
            sprintf('{"name":"%s","dbPath":"%s","tableCount":%d}',
                c$name, c$dbPath, c$tableCount)
        }), collapse = ","), "]")
        writeLines(.dbre_json_output, .dbre_temp_file)
    }

    # Cleanup: Remove all temporary variables
    rm(.dbre_all_objs, .dbre_connections, .dbre_obj_name, .dbre_tmp_obj, .dbre_db_path, .dbre_table_count, .dbre_temp_file)
    if (exists(".dbre_json_output")) rm(.dbre_json_output)

    invisible(NULL)
}, error = function(e) {
    # Silent error - write empty array to file
    writeLines("[]", "${tempFilePathR}")
    invisible(NULL)
})
  `.trim();

  await positronApi.runtime.executeCode('r', rCode, false, false, 'silent' as any, undefined, {});

  // Read from temp file
  const fileUri = vscode.Uri.file(tempFilePath);

  try {
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    const jsonStr = new TextDecoder().decode(fileContent);
    const connections = JSON.parse(jsonStr) as RConnectionInfo[];

    // Cleanup temp file
    await vscode.workspace.fs.delete(fileUri);

    // Check if we got any connections
    if (connections.length === 0) {
      throw new Error('No DuckDB connections found in R session');
    }

    return connections;
  } catch (error: any) {
    // Try to cleanup temp file even on error
    try {
      await vscode.workspace.fs.delete(fileUri);
    } catch {}

    // Re-throw if it's our "no connections" error
    if (error.message === 'No DuckDB connections found in R session') {
      throw error;
    }

    throw new Error(`Failed to read connections from file: ${error.message}`);
  }
}

/**
 * Connect to a database with consistent messaging
 * Creates a new Positron schema provider and queries R session
 */
async function connectToDatabase(connectionName: string, dbPath: string): Promise<void> {
  const positronApi = tryAcquirePositronApi();
  if (!positronApi) {
    vscode.window.showErrorMessage('Positron API not available. This extension requires Positron IDE.');
    return;
  }

  try {
    // Create new schema provider for this connection
    schemaProvider = new PositronSchemaProvider(positronApi);
    await schemaProvider.connect(connectionName, dbPath);

    // Merge R functions with Node.js base functions (R takes precedence)
    if (functionProvider) {
      const rFunctions = schemaProvider.getRFunctions();
      functionProvider.mergeRFunctions(rFunctions);
    }

    const tableCount = schemaProvider.getTableNames().length;
    const funcCount = functionProvider?.getAllFunctions().length || 0;

    // Track initial state for auto-refresh notifications
    previousTableCount = tableCount;
    previousFunctionCount = funcCount;
    shownEmptyDbWarning = (tableCount === 0);

    const dbInfo = dbPath === ':memory:' ? 'in-memory database' : dbPath;

    if (tableCount === 0) {
      // Toast notification (visible but dismissible without clicking)
      vscode.window.showInformationMessage(
        `⚠️  Connected to '${connectionName}' - Empty database. ` +
        `${funcCount} DuckDB functions available for autocomplete. Create tables in R to enable table/column autocomplete.`
      );
      outputChannel.appendLine(`⚠️  Connected to ${connectionName} (${dbInfo}) - Empty database (0 tables)`);
      outputChannel.appendLine(`   💡 Tip: Create tables in R, then schema will auto-refresh`);
    } else {
      vscode.window.showInformationMessage(
        `Connected to ${connectionName} (${dbInfo})\n${tableCount} tables, ${funcCount} functions available`
      );
      outputChannel.appendLine(`✓ Connected to ${connectionName}: ${tableCount} tables, ${funcCount} functions`);
    }

    // Debug: Log table and column details
    const tables = schemaProvider.getTableNames();
    for (const tableName of tables) {
      const columns = schemaProvider.getColumns(tableName);
      outputChannel.appendLine(`  Table: ${tableName} (${columns.length} columns)`);
      columns.forEach(col => {
        outputChannel.appendLine(`    - ${col.name}: ${col.type}`);
      });
    }
  } catch (err: any) {
    outputChannel.appendLine(`✗ Connection failed: ${err.message}`);
    vscode.window.showErrorMessage(`Failed to connect: ${err.message}`);
    throw err;
  }
}

/**
 * Refresh schema and functions with consistent messaging
 */
async function refreshSchema(): Promise<void> {
  if (!schemaProvider) {
    vscode.window.showWarningMessage('No active database connection. Connect to a database first.');
    return;
  }

  try {
    await schemaProvider.refreshSchema();
    const tableCount = schemaProvider.getTableNames().length;
    const funcCount = functionProvider?.getAllFunctions().length || 0;

    if (tableCount === 0) {
      vscode.window.showWarningMessage(
        `Schema refreshed\n\n` +
        `⚠️  Database is still empty - no tables found.\n\n` +
        `Autocomplete will work for DuckDB functions (${funcCount} available) but not for tables/columns.`,
        'OK'
      );
      outputChannel.appendLine(`⚠️  Refreshed - Still no tables found (0 tables)`);
    } else {
      vscode.window.showInformationMessage(
        `Schema refreshed: ${tableCount} tables (from R session), ${funcCount} functions`
      );
      outputChannel.appendLine(`✓ Refreshed: ${tableCount} tables, ${funcCount} functions`);
    }
  } catch (err: any) {
    outputChannel.appendLine(`✗ Refresh failed: ${err.message}`);
    vscode.window.showErrorMessage(`Failed to refresh schema: ${err.message}`);
    throw err;
  }
}

export function deactivate() {
  if (schemaProvider) {
    schemaProvider.dispose();
  }
  if (functionProvider) {
    functionProvider.dispose();
  }
}

/**
 * Setup auto-refresh on R code execution
 * Refreshes schema when code references the connection object
 */
function setupAutoRefresh(positronApi: any, context: vscode.ExtensionContext): void {
  let refreshTimer: NodeJS.Timeout | undefined;

  // Debounced refresh function with change detection
  const debouncedRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(async () => {
      if (!schemaProvider || !schemaProvider.isConnected()) {
        return;
      }

      try {
        // Refresh schema
        await schemaProvider.refreshSchema();

        // Refresh functions (from R connection)
        await schemaProvider.refreshFunctions();

        // Merge R functions with Node.js base functions
        if (functionProvider) {
          const rFunctions = schemaProvider.getRFunctions();
          functionProvider.mergeRFunctions(rFunctions);
        }

        const newTableCount = schemaProvider.getTableNames().length;
        const newFunctionCount = functionProvider?.getAllFunctions().length || 0;
        const tableCountChanged = newTableCount !== previousTableCount;
        const functionCountChanged = newFunctionCount !== previousFunctionCount;

        // Log to output channel
        outputChannel.appendLine(`[Auto-refresh] Schema updated: ${newTableCount} tables, ${newFunctionCount} functions`);

        // Detect specific schema changes and notify user
        if (tableCountChanged) {
          const connectionName = schemaProvider.getConnectionName();

          // Special case: Database was empty, now has tables (dismiss empty warning conceptually)
          if (shownEmptyDbWarning && previousTableCount === 0 && newTableCount > 0) {
            vscode.window.showInformationMessage(
              `✓ Schema updated: ${newTableCount} table${newTableCount !== 1 ? 's' : ''} detected in '${connectionName}'!`
            );
            shownEmptyDbWarning = false;
          }
          // Tables added
          else if (newTableCount > previousTableCount) {
            const added = newTableCount - previousTableCount;
            vscode.window.showInformationMessage(
              `✓ ${added} new table${added !== 1 ? 's' : ''} added to '${connectionName}' (Total: ${newTableCount} table${newTableCount !== 1 ? 's' : ''})`
            );
          }
          // Tables removed
          else if (newTableCount < previousTableCount) {
            const removed = previousTableCount - newTableCount;
            vscode.window.showInformationMessage(
              `⚠️  ${removed} table${removed !== 1 ? 's' : ''} removed from '${connectionName}' (Total: ${newTableCount} table${newTableCount !== 1 ? 's' : ''})`
            );
          }

          // Update tracked count
          previousTableCount = newTableCount;
        }

        // Detect function changes (typically from extension loading)
        if (functionCountChanged) {
          const connectionName = schemaProvider.getConnectionName();

          // Functions added (most common case - extension loaded)
          if (newFunctionCount > previousFunctionCount) {
            const added = newFunctionCount - previousFunctionCount;
            vscode.window.showInformationMessage(
              `✓ ${added} new function${added !== 1 ? 's' : ''} loaded in '${connectionName}' (Total: ${newFunctionCount} function${newFunctionCount !== 1 ? 's' : ''})`
            );
          }
          // Functions removed (less common - extension unloaded or connection changed)
          else if (newFunctionCount < previousFunctionCount) {
            const removed = previousFunctionCount - newFunctionCount;
            vscode.window.showInformationMessage(
              `⚠️  ${removed} function${removed !== 1 ? 's' : ''} removed from '${connectionName}' (Total: ${newFunctionCount} function${newFunctionCount !== 1 ? 's' : ''})`
            );
          }

          // Update tracked count
          previousFunctionCount = newFunctionCount;
        }
      } catch (error: any) {
        outputChannel.appendLine(`[Auto-refresh] Failed: ${error.message}`);
        // Don't show error to user - auto-refresh is background operation
      }
    }, DEBOUNCE_DELAY_MS);
  };

  // Listen to code execution events
  const disposable = positronApi.runtime.onDidExecuteCode((event: any) => {
    // Only process R code
    if (event.languageId !== 'r') {
      return;
    }

    // Only refresh if connected
    if (!schemaProvider || !schemaProvider.isConnected()) {
      return;
    }

    // Check if code references the connection
    const connectionName = schemaProvider.getConnectionName();
    if (!connectionName || !event.code) {
      return;
    }

    const code: string = event.code;

    // Must contain connection name
    if (!code.includes(connectionName)) {
      return;
    }

    // Check for schema-modifying operations
    const hasSchemaModifyingOp = SCHEMA_MODIFY_PATTERNS.some(pattern => pattern.test(code));

    if (hasSchemaModifyingOp) {
      outputChannel.appendLine(`[Auto-refresh] Detected schema-modifying operation on '${connectionName}', refreshing...`);
      debouncedRefresh();
      return;
    }

    // Check for extension loading (INSTALL/LOAD)
    const hasExtensionLoad = EXTENSION_LOAD_PATTERNS.some(pattern => pattern.test(code));

    if (hasExtensionLoad) {
      outputChannel.appendLine(`[Auto-refresh] Detected extension loading on '${connectionName}', refreshing functions...`);
      // Refresh both schema and functions (extension might add new functions)
      debouncedRefresh();
    }
  });

  context.subscriptions.push(disposable);
}
