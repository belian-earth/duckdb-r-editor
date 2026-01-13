import * as vscode from 'vscode';
import { DuckDBConnectionManager } from './duckdbConnection';
import { SQLStringDetector } from './sqlStringDetector';
import { getFunctionCompletions, getKeywordCompletions } from './duckdbFunctions';

export class SQLCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private connectionManager: DuckDBConnectionManager) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
        // Check if we're inside a SQL string
        const sqlContext = SQLStringDetector.isInsideSQLString(document, position);
        if (!sqlContext) {
            return null;
        }

        // If this is a glue string, check if cursor is inside an interpolation block
        if (sqlContext.isGlueString) {
            const cursorOffset = SQLStringDetector.getSQLCursorPosition(document, position, sqlContext);
            if (SQLStringDetector.isInsideGlueInterpolation(sqlContext.query, cursorOffset)) {
                // Cursor is inside {}, let R handle completions
                return null;
            }
        }

        const completions: vscode.CompletionItem[] = [];

        // Get text before cursor in the SQL string
        const textBeforeCursor = this.getTextBeforeCursor(document, position, sqlContext.range);
        const currentWord = this.getCurrentWord(textBeforeCursor);

        // Check if we're typing after a dot (table.column scenario)
        if (this.isDotCompletion(textBeforeCursor)) {
            const tableName = this.getTableNameBeforeDot(textBeforeCursor);
            completions.push(...this.getColumnCompletions(tableName));
        } else {
            // General completions
            completions.push(...getFunctionCompletions());
            completions.push(...getKeywordCompletions());
            completions.push(...this.getTableCompletions());
            completions.push(...this.getAllColumnCompletions());
        }

        return completions;
    }

    /**
     * Get text before cursor within the SQL string
     */
    private getTextBeforeCursor(
        document: vscode.TextDocument,
        position: vscode.Position,
        sqlRange: vscode.Range
    ): string {
        const startPos = sqlRange.start;

        if (position.line === startPos.line) {
            return document.getText(new vscode.Range(startPos, position));
        }

        // Multi-line SQL string
        let text = document.getText(new vscode.Range(startPos, new vscode.Position(startPos.line, document.lineAt(startPos.line).text.length)));

        for (let line = startPos.line + 1; line < position.line; line++) {
            text += '\n' + document.lineAt(line).text;
        }

        text += '\n' + document.getText(new vscode.Range(new vscode.Position(position.line, 0), position));

        return text;
    }

    /**
     * Get current word being typed
     */
    private getCurrentWord(text: string): string {
        const match = text.match(/[\w_]+$/);
        return match ? match[0] : '';
    }

    /**
     * Check if we're completing after a dot (e.g., "table.")
     */
    private isDotCompletion(text: string): boolean {
        return /[\w_]+\.\s*[\w_]*$/.test(text);
    }

    /**
     * Get table name before the dot
     */
    private getTableNameBeforeDot(text: string): string {
        const match = text.match(/([\w_]+)\.\s*[\w_]*$/);
        return match ? match[1] : '';
    }

    /**
     * Get table name completions
     */
    private getTableCompletions(): vscode.CompletionItem[] {
        if (!this.connectionManager.isConnected()) {
            return [];
        }

        const tables = this.connectionManager.getTableNames();

        return tables.map(tableName => {
            const item = new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Class);
            item.detail = 'Table';

            // Add column info to documentation
            const columns = this.connectionManager.getColumns(tableName);
            const columnInfo = columns
                .map(col => `- ${col.name}: ${col.type}`)
                .join('\n');

            item.documentation = new vscode.MarkdownString(
                `**Table: ${tableName}**\n\nColumns:\n${columnInfo}`
            );

            item.sortText = `3_${tableName}`;
            return item;
        });
    }

    /**
     * Get column completions for a specific table
     */
    private getColumnCompletions(tableName: string): vscode.CompletionItem[] {
        if (!this.connectionManager.isConnected()) {
            return [];
        }

        const columns = this.connectionManager.getColumns(tableName);

        return columns.map(column => {
            const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
            item.detail = `${column.type} (${tableName})`;
            item.documentation = new vscode.MarkdownString(
                `**Column: ${column.name}**\n\nType: ${column.type}\n\nTable: ${tableName}\n\nNullable: ${column.nullable ? 'Yes' : 'No'}`
            );
            item.sortText = `0_${column.name}`;
            return item;
        });
    }

    /**
     * Get all column completions from all tables
     */
    private getAllColumnCompletions(): vscode.CompletionItem[] {
        if (!this.connectionManager.isConnected()) {
            return [];
        }

        const allColumns = this.connectionManager.getAllColumns();

        return allColumns.map(({ table, column }) => {
            const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
            item.detail = `${column.type} (${table})`;
            item.documentation = new vscode.MarkdownString(
                `**Column: ${column.name}**\n\nType: ${column.type}\n\nTable: ${table}\n\nNullable: ${column.nullable ? 'Yes' : 'No'}`
            );
            // Show table.column as a snippet option
            item.additionalTextEdits = [];
            item.sortText = `4_${column.name}`;

            return item;
        });
    }
}
