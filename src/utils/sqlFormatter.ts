import * as vscode from 'vscode';
import { format } from 'sql-formatter';
import { SQLStringDetector } from '../sqlStringDetector';
import { GlueInterpolationHandler } from './glueInterpolationHandler';
import { EXTENSION_ID } from '../constants';

export interface FormatOptions {
    indentStyle: 'standard' | 'tabularLeft' | 'tabularRight';
    keywordCase: 'preserve' | 'upper' | 'lower';
}

/**
 * Formats SQL strings in R code
 */
export class SQLFormatter {
    /**
     * Format SQL at the current cursor position
     */
    static async formatSQLAtCursor(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<boolean> {
        try {
            // Find SQL string at cursor
            const sqlContext = SQLStringDetector.isInsideSQLString(document, position);
            if (!sqlContext) {
                vscode.window.showWarningMessage(
                    'Cursor is not inside a SQL string in a DBI function call'
                );
                return false;
            }

            // Get formatting options from config
            const config = vscode.workspace.getConfiguration(EXTENSION_ID);
            const options: FormatOptions = {
                indentStyle: config.get<'standard' | 'tabularLeft' | 'tabularRight'>('sqlFormattingStyle', 'standard'),
                keywordCase: config.get<'preserve' | 'upper' | 'lower'>('sqlKeywordCase', 'preserve')
            };

            let formattedSQL: string;

            // Handle glue strings (contains {variable} interpolations)
            if (sqlContext.isGlueString) {
                // Extract interpolations and replace with placeholders
                const { sql: cleanSQL, replacements } = GlueInterpolationHandler.extractInterpolations(sqlContext.query);

                // Validate extraction: all placeholders should be in the cleaned SQL
                for (const replacement of replacements) {
                    if (!cleanSQL.includes(replacement.placeholder)) {
                        vscode.window.showErrorMessage(
                            `SQL formatting failed: Interpolation extraction error. Placeholder ${replacement.placeholder} not found in cleaned SQL.`
                        );
                        return false;
                    }
                }

                // Format the SQL with placeholders
                const formatted = this.formatSQL(cleanSQL, options);

                // Validate formatting didn't fail
                if (formatted === cleanSQL) {
                    // Formatting returned the original, likely due to error
                    return false;
                }

                // Restore original interpolations
                formattedSQL = GlueInterpolationHandler.restoreInterpolations(formatted, replacements);

                // Validate restoration: all placeholders should be replaced
                for (const replacement of replacements) {
                    if (formattedSQL.includes(replacement.placeholder)) {
                        vscode.window.showErrorMessage(
                            `SQL formatting failed: Interpolation restoration incomplete. Placeholder ${replacement.placeholder} still present.`
                        );
                        return false;
                    }
                }

                // Final sanity check: count braces
                const originalBraceCount = (sqlContext.query.match(/\{/g) || []).length;
                const formattedBraceCount = (formattedSQL.match(/\{/g) || []).length;
                if (originalBraceCount !== formattedBraceCount) {
                    vscode.window.showErrorMessage(
                        `SQL formatting failed: Brace count mismatch. Original: ${originalBraceCount}, Formatted: ${formattedBraceCount}. This indicates a bug in interpolation handling.`
                    );
                    return false;
                }
            } else {
                // Format regular SQL
                formattedSQL = this.formatSQL(sqlContext.query, options);
            }

            // If formatting failed, formatSQL returns the original - check if it's the same
            if (formattedSQL === sqlContext.query) {
                // Don't apply edit if nothing changed (might be due to error)
                return false;
            }

            // Calculate indentation from the opening quote position
            const baseIndent = this.getBaseIndentation(document, sqlContext.range.start);

            // Apply indentation to formatted SQL (except first line)
            const indentedSQL = this.applyIndentation(formattedSQL, baseIndent);

            // Replace the SQL in the document
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, sqlContext.range, indentedSQL);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                vscode.window.showInformationMessage('SQL formatted successfully');
            }

            return success;
        } catch (error) {
            // Ensure we never throw an exception that could interfere with VSCode operations like autosave
            vscode.window.showErrorMessage(
                `SQL formatting encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return false;
        }
    }

    /**
     * Format SQL string using sql-formatter
     */
    private static formatSQL(sql: string, options: FormatOptions): string {
        try {
            return format(sql, {
                language: 'duckdb',
                tabWidth: 2,
                keywordCase: options.keywordCase,
                indentStyle: options.indentStyle,
                linesBetweenQueries: 1
            });
        } catch (error) {
            vscode.window.showErrorMessage(
                `SQL formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return sql; // Return original on error
        }
    }

    /**
     * Get the base indentation from the line containing the opening quote
     */
    private static getBaseIndentation(document: vscode.TextDocument, position: vscode.Position): string {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Extract indentation (whitespace from start of line)
        const match = lineText.match(/^(\s*)/);
        const lineIndent = match ? match[1] : '';

        // We want to indent relative to the content inside the string
        // For multi-line strings, we typically want one more level of indentation
        // But for the first line, we don't add extra indent
        return lineIndent + '  '; // Add 2 spaces for content indentation
    }

    /**
     * Apply indentation to all lines except the first
     */
    private static applyIndentation(sql: string, baseIndent: string): string {
        const lines = sql.split('\n');

        if (lines.length === 1) {
            return sql; // Single line, no indentation needed
        }

        // First line stays as-is (no leading indent)
        // Subsequent lines get the base indentation
        return lines.map((line, index) => {
            if (index === 0) {
                return line;
            }
            // Don't indent empty lines
            if (line.trim() === '') {
                return '';
            }
            return baseIndent + line;
        }).join('\n');
    }

    /**
     * Check if formatting is available for the current position
     */
    static canFormat(document: vscode.TextDocument, position: vscode.Position): boolean {
        const sqlContext = SQLStringDetector.isInsideSQLString(document, position);
        return sqlContext !== null;
    }
}
