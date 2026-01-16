import * as vscode from 'vscode';
import { SQLCompletionProvider } from './completionProvider';
import { DuckDBConnectionManager } from './duckdbConnection';
import { DuckDBCliProvider } from './duckdbCliProvider';
import { SQLDiagnosticsProvider } from './diagnosticsProvider';
import { SchemaProvider } from './types';
import { DocumentCache } from './documentCache';
import { SQLSemanticTokenProvider } from './semanticTokenProvider';
import { tryAcquirePositronApi } from '@posit-dev/positron';

let cliProvider: DuckDBCliProvider | undefined;
let connectionManager: DuckDBConnectionManager | undefined;
let schemaProvider: SchemaProvider;
let diagnosticsProvider: SQLDiagnosticsProvider;
let outputChannel: vscode.OutputChannel;
let documentCache: DocumentCache;
let semanticTokenProvider: SQLSemanticTokenProvider;

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('R SQL Editor');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('R SQL Editor extension is now active');

  // Try to acquire Positron API (for R session integration)
  const positronApi = tryAcquirePositronApi();
  if (positronApi) {
    outputChannel.appendLine('✓ Positron API acquired - R session integration available');
  } else {
    outputChannel.appendLine('ℹ️  Positron API not available (running in VS Code or older Positron)');
  }

  // Try to use DuckDB CLI first (preferred method - more dynamic and flexible)
  outputChannel.appendLine('Checking for DuckDB CLI...');
  cliProvider = new DuckDBCliProvider(positronApi);

  const cliAvailable = await cliProvider.isDuckDBCliAvailable();

  if (cliAvailable) {
    outputChannel.appendLine('✓ DuckDB CLI detected - using dynamic introspection mode');
    outputChannel.appendLine('  This mode automatically discovers ALL DuckDB functions, including extensions!');
    schemaProvider = cliProvider as SchemaProvider;
    context.subscriptions.push(cliProvider!);
  } else {
    outputChannel.appendLine('✗ DuckDB CLI not found - falling back to Node.js bindings');
    outputChannel.appendLine('  Install DuckDB CLI for better experience: https://duckdb.org/docs/installation/');
    connectionManager = new DuckDBConnectionManager();
    schemaProvider = connectionManager;
    context.subscriptions.push(connectionManager);
  }

  outputChannel.appendLine('ℹ️  Use "DuckDB R Editor: Connect to DuckDB Database" command to connect to a database');

  // Initialize diagnostics provider
  outputChannel.appendLine('Initializing diagnostics provider');
  diagnosticsProvider = new SQLDiagnosticsProvider();

  // Initialize document cache for performance and stability
  outputChannel.appendLine('Initializing document cache');
  documentCache = new DocumentCache();

  // Check if semantic highlighting is enabled (default: true)
  const config = vscode.workspace.getConfiguration('duckdb-r-editor');
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

  // Register completion provider for R files
  outputChannel.appendLine('Registering completion provider for R files');
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'r', scheme: 'file' },
    new SQLCompletionProvider(schemaProvider as any),
    '.', // Trigger on dot for table.column
    '(', // Trigger on function call
    ' ', // Trigger on space
    '\n', // Trigger on newline
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
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'DuckDB Database': ['db', 'duckdb', 'ddb']
        },
        title: 'Select DuckDB Database File'
      });

      if (uri && uri[0]) {
        await connectToDatabase(uri[0].fsPath);
      }
    }
  );

  const disconnectCommand = vscode.commands.registerCommand(
    'duckdb-r-editor.disconnectDatabase',
    async () => {
      if (!schemaProvider.isConnected()) {
        vscode.window.showInformationMessage('No active database connection');
        return;
      }

      // Disconnect by disposing the providers
      if (cliProvider) {
        cliProvider.dispose();
        cliProvider = new DuckDBCliProvider(positronApi);
        schemaProvider = cliProvider;
      } else if (connectionManager) {
        connectionManager.dispose();
        connectionManager = new DuckDBConnectionManager();
        schemaProvider = connectionManager;
      }

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
      if (!cliProvider) {
        vscode.window.showWarningMessage('Extension loading requires DuckDB CLI');
        return;
      }

      const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter DuckDB extension name (e.g., spatial, httpfs, json)',
        placeHolder: 'spatial',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Extension name is required';
          }
          return null;
        }
      });

      if (extensionName) {
        try {
          await cliProvider.loadExtensionForAutocomplete(extensionName.trim());
          const funcCount = cliProvider.getAllFunctions?.()?.length || 0;
          vscode.window.showInformationMessage(
            `✓ Extension '${extensionName}' loaded! ${funcCount} functions now available for autocomplete.`
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to load extension: ${err.message}`);
        }
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

  outputChannel.appendLine('Extension activation complete!');
  outputChannel.appendLine('Commands available: "R SQL: Connect to DuckDB Database", "R SQL: Refresh Database Schema"');
}

/**
 * Connect to a database with consistent messaging
 */
async function connectToDatabase(dbPath: string): Promise<void> {
  try {
    if (cliProvider) {
      await cliProvider.connect(dbPath);
      const tableCount = schemaProvider.getTableNames().length;
      const funcCount = cliProvider.getAllFunctions?.()?.length || 0;

      if (tableCount === 0) {
        vscode.window.showWarningMessage(
          `Connected to ${dbPath} but found 0 tables. The database may be locked by another process (like an R session). Try disconnecting from other connections first.`
        );
        outputChannel.appendLine(`⚠️  Connected but found 0 tables - database may be locked`);
      } else {
        vscode.window.showInformationMessage(
          `Connected to ${dbPath}\n${tableCount} tables, ${funcCount} functions discovered`
        );
        outputChannel.appendLine(`✓ Connected: ${tableCount} tables, ${funcCount} functions`);
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
    } else if (connectionManager) {
      await connectionManager.connect(dbPath);
      const tableCount = schemaProvider.getTableNames().length;

      if (tableCount === 0) {
        vscode.window.showWarningMessage(
          `Connected to ${dbPath} but found 0 tables. The database may be locked by another process (like an R session). Try disconnecting from other connections first.`
        );
        outputChannel.appendLine(`⚠️  Connected but found 0 tables - database may be locked`);
      } else {
        vscode.window.showInformationMessage(
          `Connected to ${dbPath}\n${tableCount} tables`
        );
        outputChannel.appendLine(`✓ Connected: ${tableCount} tables`);
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
  try {
    if (cliProvider) {
      await cliProvider.refreshSchema();
      await cliProvider.refreshFunctions();
      const tableCount = cliProvider.getTableNames().length;
      const funcCount = cliProvider.getAllFunctions?.()?.length || 0;
      vscode.window.showInformationMessage(
        `Schema refreshed: ${tableCount} tables, ${funcCount} functions`
      );
      outputChannel.appendLine(`✓ Refreshed: ${tableCount} tables, ${funcCount} functions`);
    } else if (connectionManager) {
      await connectionManager.refreshSchema();
      const tableCount = connectionManager.getTableNames().length;
      vscode.window.showInformationMessage(
        `Schema refreshed: ${tableCount} tables`
      );
      outputChannel.appendLine(`✓ Refreshed: ${tableCount} tables`);
    }
  } catch (err: any) {
    outputChannel.appendLine(`✗ Refresh failed: ${err.message}`);
    vscode.window.showErrorMessage(`Failed to refresh schema: ${err.message}`);
    throw err;
  }
}

export function deactivate() {
  if (cliProvider) {
    cliProvider.dispose();
  }
  if (connectionManager) {
    connectionManager.dispose();
  }
}
