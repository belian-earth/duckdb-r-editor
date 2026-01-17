import * as vscode from 'vscode';
import { PositronSchemaProvider } from './positronSchemaProvider';

/**
 * Schema signature for efficient change detection
 */
interface SchemaSignature {
    tables: Map<string, number>; // table name -> column count
    hash: string; // Quick comparison hash
}

/**
 * Watches for schema changes in the R DuckDB connection and automatically refreshes
 * Uses a lightweight polling mechanism with smart debouncing
 */
export class SchemaWatcher implements vscode.Disposable {
    private schemaProvider: PositronSchemaProvider;
    private positronApi: any;
    private outputChannel: vscode.OutputChannel;

    // Polling state
    private pollTimer: NodeJS.Timeout | null = null;
    private pollInterval: number;
    private isEnabled: boolean;

    // Debouncing
    private debounceTimer: NodeJS.Timeout | null = null;
    private debounceDelay: number = 300; // ms

    // Schema signature for change detection
    private currentSignature: SchemaSignature | null = null;

    // Activity tracking
    private lastCheckTime: Date | null = null;
    private checkOnActivity: boolean;

    // Disposables
    private disposables: vscode.Disposable[] = [];

    constructor(
        schemaProvider: PositronSchemaProvider,
        positronApi: any,
        outputChannel: vscode.OutputChannel
    ) {
        this.schemaProvider = schemaProvider;
        this.positronApi = positronApi;
        this.outputChannel = outputChannel;

        // Get configuration
        const config = vscode.workspace.getConfiguration('duckdb-r-editor');
        this.isEnabled = config.get<boolean>('autoRefreshSchema', true);
        this.pollInterval = config.get<number>('autoRefreshInterval', 5000);
        this.checkOnActivity = config.get<boolean>('autoRefreshOnActivity', true);

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('duckdb-r-editor')) {
                    this.handleConfigurationChange();
                }
            })
        );
    }

    /**
     * Start watching for schema changes
     */
    start(): void {
        if (!this.isEnabled) {
            this.outputChannel.appendLine('Schema auto-refresh is disabled in settings');
            return;
        }

        this.outputChannel.appendLine(`Starting schema watcher (interval: ${this.pollInterval}ms)`);

        // Initialize current signature
        this.updateCurrentSignature();

        // Start polling timer
        this.startPolling();

        // Register activity listeners if enabled
        if (this.checkOnActivity) {
            this.registerActivityListeners();
        }
    }

    /**
     * Stop watching for schema changes
     */
    stop(): void {
        this.outputChannel.appendLine('Stopping schema watcher');
        this.stopPolling();
        this.clearDebounce();
    }

    /**
     * Start the polling timer
     */
    private startPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }

        this.pollTimer = setInterval(() => {
            this.checkForChanges();
        }, this.pollInterval);
    }

    /**
     * Stop the polling timer
     */
    private stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Register listeners for user activity
     */
    private registerActivityListeners(): void {
        // Check on R file saves
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                if (document.languageId === 'r') {
                    this.outputChannel.appendLine('R file saved, triggering schema check');
                    this.checkForChangesDebounced();
                }
            })
        );
    }

    /**
     * Check for schema changes with debouncing
     */
    private checkForChangesDebounced(): void {
        this.clearDebounce();

        this.debounceTimer = setTimeout(() => {
            this.checkForChanges();
        }, this.debounceDelay);
    }

    /**
     * Clear debounce timer
     */
    private clearDebounce(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    /**
     * Check for schema changes by comparing signatures
     */
    private async checkForChanges(): Promise<void> {
        try {
            const newSignature = await this.fetchSchemaSignature();

            if (!newSignature) {
                // Connection might be lost
                return;
            }

            if (!this.currentSignature) {
                // First check, just store signature
                this.currentSignature = newSignature;
                this.lastCheckTime = new Date();
                return;
            }

            // Compare signatures
            if (this.signaturesMatch(this.currentSignature, newSignature)) {
                // No changes detected
                this.lastCheckTime = new Date();
                return;
            }

            // Schema has changed! Trigger full refresh
            this.outputChannel.appendLine('Schema changes detected, refreshing...');
            await this.performFullRefresh();

            // Update signature after refresh
            this.currentSignature = newSignature;
            this.lastCheckTime = new Date();

        } catch (error: any) {
            this.outputChannel.appendLine(`Schema check failed: ${error.message}`);
        }
    }

    /**
     * Fetch lightweight schema signature (table names + column counts)
     */
    private async fetchSchemaSignature(): Promise<SchemaSignature | null> {
        const connectionName = this.schemaProvider.getConnectionName();

        if (!connectionName) {
            return null;
        }

        const rCode = `
tryCatch({
    if (!exists("${connectionName}", envir = .GlobalEnv)) {
        stop("Connection '${connectionName}' not found")
    }

    con <- get("${connectionName}", envir = .GlobalEnv)

    if (!inherits(con, "duckdb_connection")) {
        stop("Object '${connectionName}' is not a DuckDB connection")
    }

    tables <- DBI::dbListTables(con)
    result <- list()

    for (table in tables) {
        tryCatch({
            col_count <- DBI::dbGetQuery(con, sprintf(
                "SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_name = '%s' AND table_schema = 'main'",
                table
            ))$cnt[1]

            result[[length(result) + 1]] <- list(
                table_name = table,
                column_count = col_count
            )
        }, error = function(e) {
            # Silently skip tables that can't be queried
        })
    }

    json_output <- if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::toJSON(result, auto_unbox = TRUE)
    } else {
        if (length(result) == 0) {
            "[]"
        } else {
            paste0("[", paste(sapply(result, function(r) {
                sprintf('{"table_name":"%s","column_count":%d}',
                    r$table_name, r$column_count)
            }), collapse = ","), "]")
        }
    }

    cat("__JSON_START__\\n")
    cat(json_output)
    cat("\\n__JSON_END__\\n")
}, error = function(e) {
    stop(e$message)
})
        `.trim();

        try {
            let output = '';
            let errorOutput = '';

            await this.positronApi.runtime.executeCode(
                'r',
                rCode,
                false,
                false,
                'transient' as any,
                undefined,
                {
                    onOutput: (text: string) => { output += text; },
                    onError: (text: string) => { errorOutput += text; }
                }
            );

            if (!output || output.trim().length === 0) {
                return null;
            }

            const jsonStartMarker = '__JSON_START__';
            const jsonEndMarker = '__JSON_END__';
            const startIndex = output.indexOf(jsonStartMarker);
            const endIndex = output.indexOf(jsonEndMarker);

            if (startIndex === -1 || endIndex === -1) {
                return null;
            }

            const jsonStr = output.substring(startIndex + jsonStartMarker.length, endIndex).trim();
            const signatureData = JSON.parse(jsonStr);

            // Build signature
            const tables = new Map<string, number>();
            for (const row of signatureData) {
                tables.set(row.table_name, row.column_count);
            }

            // Create hash for quick comparison
            const hash = this.createSignatureHash(tables);

            return { tables, hash };
        } catch (error: any) {
            this.outputChannel.appendLine(`Failed to fetch schema signature: ${error.message}`);
            return null;
        }
    }

    /**
     * Create a hash from the schema signature for quick comparison
     */
    private createSignatureHash(tables: Map<string, number>): string {
        const entries = Array.from(tables.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, count]) => `${name}:${count}`)
            .join('|');
        return entries;
    }

    /**
     * Compare two schema signatures
     */
    private signaturesMatch(sig1: SchemaSignature, sig2: SchemaSignature): boolean {
        return sig1.hash === sig2.hash;
    }

    /**
     * Perform full schema refresh
     */
    private async performFullRefresh(): Promise<void> {
        try {
            await this.schemaProvider.refreshSchema();

            const tableCount = this.schemaProvider.getTableNames().length;
            this.outputChannel.appendLine(`✓ Schema auto-refreshed: ${tableCount} tables`);

            // Show subtle notification (don't interrupt user)
            vscode.window.setStatusBarMessage(
                `$(sync) Schema refreshed: ${tableCount} tables`,
                3000
            );
        } catch (error: any) {
            this.outputChannel.appendLine(`✗ Auto-refresh failed: ${error.message}`);
        }
    }

    /**
     * Update the current signature from the schema provider
     */
    private updateCurrentSignature(): void {
        const tables = new Map<string, number>();
        const tableNames = this.schemaProvider.getTableNames();

        for (const tableName of tableNames) {
            const columns = this.schemaProvider.getColumns(tableName);
            tables.set(tableName, columns.length);
        }

        const hash = this.createSignatureHash(tables);
        this.currentSignature = { tables, hash };
    }

    /**
     * Handle configuration changes
     */
    private handleConfigurationChange(): void {
        const config = vscode.workspace.getConfiguration('duckdb-r-editor');
        const newEnabled = config.get<boolean>('autoRefreshSchema', true);
        const newInterval = config.get<number>('autoRefreshInterval', 5000);
        const newCheckOnActivity = config.get<boolean>('autoRefreshOnActivity', true);

        if (newEnabled !== this.isEnabled) {
            this.isEnabled = newEnabled;
            if (this.isEnabled) {
                this.outputChannel.appendLine('Auto-refresh enabled via settings');
                this.start();
            } else {
                this.outputChannel.appendLine('Auto-refresh disabled via settings');
                this.stop();
            }
        }

        if (newInterval !== this.pollInterval) {
            this.pollInterval = newInterval;
            if (this.isEnabled && this.pollTimer) {
                this.outputChannel.appendLine(`Auto-refresh interval changed to ${this.pollInterval}ms`);
                this.startPolling(); // Restart with new interval
            }
        }

        if (newCheckOnActivity !== this.checkOnActivity) {
            this.checkOnActivity = newCheckOnActivity;
            this.outputChannel.appendLine(`Auto-refresh on activity ${this.checkOnActivity ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Get the last check time
     */
    getLastCheckTime(): Date | null {
        return this.lastCheckTime;
    }

    /**
     * Check if watcher is enabled
     */
    isWatcherEnabled(): boolean {
        return this.isEnabled && this.pollTimer !== null;
    }

    dispose(): void {
        this.stop();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
