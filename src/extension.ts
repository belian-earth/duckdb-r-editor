import * as vscode from 'vscode';
import { SQLCompletionProvider } from './completionProvider';
import { DuckDBConnectionManager } from './duckdbConnection';
import { DuckDBCliProvider } from './duckdbCliProvider';
import { SQLDiagnosticsProvider } from './diagnosticsProvider';
import { SchemaProvider } from './types';
import { DocumentCache } from './documentCache';
import { SQLSemanticTokenProvider } from './semanticTokenProvider';

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

  // Try to use DuckDB CLI first (preferred method - more dynamic and flexible)
  outputChannel.appendLine('Checking for DuckDB CLI...');
  cliProvider = new DuckDBCliProvider();

  const cliAvailable = await cliProvider.isDuckDBCliAvailable();

  if (cliAvailable) {
    outputChannel.appendLine('✓ DuckDB CLI detected - using dynamic introspection mode');
    outputChannel.appendLine('  This mode automatically discovers ALL DuckDB functions, including extensions!');
    schemaProvider = cliProvider as SchemaProvider;
    context.subscriptions.push(cliProvider!);

    // Try to auto-connect
    await tryAutoConnect();
  } else {
    outputChannel.appendLine('✗ DuckDB CLI not found - falling back to Node.js bindings');
    outputChannel.appendLine('  Install DuckDB CLI for better experience: https://duckdb.org/docs/installation/');
    connectionManager = new DuckDBConnectionManager();
    schemaProvider = connectionManager;
    context.subscriptions.push(connectionManager);

    // Try to auto-connect
    await tryAutoConnect();
  }

  // Initialize diagnostics provider
  outputChannel.appendLine('Initializing diagnostics provider');
  diagnosticsProvider = new SQLDiagnosticsProvider();

  // Initialize document cache for performance and stability
  outputChannel.appendLine('Initializing document cache');
  documentCache = new DocumentCache();

  // Check if semantic highlighting is enabled (default: true)
  const config = vscode.workspace.getConfiguration('rsqledit');
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
    'rsqledit.connectDatabase',
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

  const refreshSchemaCommand = vscode.commands.registerCommand(
    'rsqledit.refreshSchema',
    refreshSchema
  );

  const loadExtensionCommand = vscode.commands.registerCommand(
    'rsqledit.loadExtension',
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

  const executeQueryCommand = vscode.commands.registerCommand(
    'rsqledit.executeQuery',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const query = await extractQueryAtCursor(editor);
      if (query) {
        await executeAndShowResults(query);
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
    refreshSchemaCommand,
    loadExtensionCommand,
    executeQueryCommand
  );

  outputChannel.appendLine('Extension activation complete!');
  outputChannel.appendLine('Commands available: "R SQL: Connect to DuckDB Database", "R SQL: Refresh Database Schema", "R SQL: Execute Query at Cursor"');
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
      vscode.window.showInformationMessage(
        `Connected to ${dbPath}\n${tableCount} tables, ${funcCount} functions discovered`
      );
      outputChannel.appendLine(`✓ Connected: ${tableCount} tables, ${funcCount} functions`);
    } else if (connectionManager) {
      await connectionManager.connect(dbPath);
      const tableCount = schemaProvider.getTableNames().length;
      vscode.window.showInformationMessage(
        `Connected to ${dbPath}\n${tableCount} tables`
      );
      outputChannel.appendLine(`✓ Connected: ${tableCount} tables`);
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

/**
 * Try to auto-connect to a database
 */
async function tryAutoConnect() {
  const config = vscode.workspace.getConfiguration('rsqledit');
  let dbPath = config.get<string>('duckdbPath');

  // If no path configured, look for test.duckdb in workspace root
  if (!dbPath && vscode.workspace.workspaceFolders) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const testDbPath = `${workspaceRoot}/test.duckdb`;
    dbPath = testDbPath;
  }

  if (dbPath) {
    outputChannel.appendLine(`Attempting to auto-connect to database: ${dbPath}`);
    try {
      await connectToDatabase(dbPath);
    } catch (err: any) {
      // Error already logged by connectToDatabase
      vscode.window.showWarningMessage(`Could not auto-connect to database: ${err.message}`);
    }
  }
}

async function extractQueryAtCursor(editor: vscode.TextEditor): Promise<string | null> {
  const position = editor.selection.active;
  const document = editor.document;
  const line = document.lineAt(position.line);

  // Find the SQL string at cursor
  const text = line.text;
  const match = text.match(/["']([^"']+)["']/);

  if (match) {
    return match[1];
  }

  return null;
}

async function executeAndShowResults(query: string) {
  if (!schemaProvider.isConnected()) {
    vscode.window.showWarningMessage('No database connection. Use "R SQL: Connect to DuckDB Database" first.');
    return;
  }

  try {
    let results: any[];

    if (cliProvider) {
      outputChannel.appendLine(`Executing query via CLI: ${query.substring(0, 100)}...`);
      results = await cliProvider.executeQuery(query);
      outputChannel.appendLine(`✓ Query returned ${results.length} rows`);
    } else if (connectionManager) {
      results = await connectionManager.executeQuery(query);
    } else {
      throw new Error('No connection available');
    }

    const panel = vscode.window.createWebviewPanel(
      'sqlResults',
      'SQL Results',
      vscode.ViewColumn.Beside,
      {}
    );

    panel.webview.html = formatResultsAsHTML(results);
  } catch (error: any) {
    outputChannel.appendLine(`✗ Query failed: ${error.message}`);
    vscode.window.showErrorMessage(`Query failed: ${error.message}`);
  }
}

function formatResultsAsHTML(results: any[]): string {
  if (!results || results.length === 0) {
    return '<html><body><p>No results</p></body></html>';
  }

  const columns = Object.keys(results[0]);
  let html = '<html><head><style>table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #4CAF50; color: white; }</style></head><body>';
  html += '<table><thead><tr>';

  for (const col of columns) {
    html += `<th>${col}</th>`;
  }

  html += '</tr></thead><tbody>';

  for (const row of results) {
    html += '<tr>';
    for (const col of columns) {
      html += `<td>${row[col]}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></body></html>';
  return html;
}

export function deactivate() {
  if (cliProvider) {
    cliProvider.dispose();
  }
  if (connectionManager) {
    connectionManager.dispose();
  }
}
