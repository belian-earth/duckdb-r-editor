import * as vscode from 'vscode';
import { SQLStringDetector } from './sqlStringDetector';

/**
 * Provides basic SQL diagnostics and validation
 */
export class SQLDiagnosticsProvider implements vscode.CodeActionProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('duckdb-r-editor');
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const codeActions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === 'sql-syntax') {
                const fix = new vscode.CodeAction('Fix SQL syntax', vscode.CodeActionKind.QuickFix);
                fix.diagnostics = [diagnostic];
                codeActions.push(fix);
            }
        }

        return codeActions;
    }

    updateDiagnostics(document: vscode.TextDocument): void {
        const diagnostics: vscode.Diagnostic[] = [];
        const processedRanges = new Set<string>();

        // Basic SQL validation
        for (let i = 0; i < document.lineCount; i++) {
            const _line = document.lineAt(i);
            const position = new vscode.Position(i, 0);

            const sqlContext = SQLStringDetector.isInsideSQLString(document, position);
            if (sqlContext) {
                // Skip if we've already processed this SQL string
                const rangeKey = `${sqlContext.range.start.line}:${sqlContext.range.start.character}-${sqlContext.range.end.line}:${sqlContext.range.end.character}`;
                if (processedRanges.has(rangeKey)) {
                    continue;
                }
                processedRanges.add(rangeKey);

                // If it's a glue string, strip interpolations for validation
                let query = sqlContext.query;
                if (sqlContext.isGlueString) {
                    query = SQLStringDetector.stripGlueInterpolations(query);
                }

                const queryUpper = query.toUpperCase();

                // Check for SELECT without FROM (unless it's a valid expression)
                if (queryUpper.includes('SELECT') && !queryUpper.includes('FROM') && !this.isValidSelectExpression(queryUpper)) {
                    const diagnostic = new vscode.Diagnostic(
                        sqlContext.range,
                        'SELECT statement is missing FROM clause',
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.code = 'sql-syntax';
                    diagnostics.push(diagnostic);
                }

                // Check for unmatched parentheses
                const openParens = (queryUpper.match(/\(/g) || []).length;
                const closeParens = (queryUpper.match(/\)/g) || []).length;

                if (openParens !== closeParens) {
                    const diagnostic = new vscode.Diagnostic(
                        sqlContext.range,
                        `Unmatched parentheses: ${openParens} opening, ${closeParens} closing`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'sql-syntax';
                    diagnostics.push(diagnostic);
                }

                // Check for common typos
                const typos = [
                    { pattern: /\bSELECT\s+FROM\b/, message: 'Missing column list after SELECT' },
                    { pattern: /\bWHERE\s+(GROUP BY|ORDER BY|LIMIT)\b/, message: 'WHERE clause appears to be incomplete' }
                ];

                for (const typo of typos) {
                    if (typo.pattern.test(queryUpper)) {
                        const diagnostic = new vscode.Diagnostic(
                            sqlContext.range,
                            typo.message,
                            vscode.DiagnosticSeverity.Warning
                        );
                        diagnostic.code = 'sql-syntax';
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private isValidSelectExpression(query: string): boolean {
        // Allow simple expressions like SELECT 1, SELECT NOW(), etc.
        return /SELECT\s+[\d\w()'",\s]+$/i.test(query.trim());
    }

    dispose() {
        this.diagnosticCollection.dispose();
    }
}
