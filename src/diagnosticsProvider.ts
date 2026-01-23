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

        // Search for SQL function patterns in the document
        const sqlFunctionPattern = /\b(dbGetQuery|dbExecute|dbSendQuery|dbSendStatement|glue_sql|glue_data_sql|DBI::|glue::)\s*\(/g;
        const fullText = document.getText();

        let match;
        while ((match = sqlFunctionPattern.exec(fullText)) !== null) {
            // Convert text offset to position
            const matchPosition = document.positionAt(match.index);

            // Look for opening quote after the function call (within a few lines)
            for (let offset = 0; offset <= 5 && matchPosition.line + offset < document.lineCount; offset++) {
                const checkLine = document.lineAt(matchPosition.line + offset);
                const checkText = checkLine.text;

                // Find first unescaped quote
                for (let charIdx = 0; charIdx < checkText.length; charIdx++) {
                    const char = checkText[charIdx];
                    if ((char === '"' || char === "'" || char === '`') &&
                        (charIdx === 0 || checkText[charIdx - 1] !== '\\')) {

                        // Found a potential opening quote - check the position INSIDE it
                        const testPos = new vscode.Position(matchPosition.line + offset, charIdx + 1);
                        this.checkAndValidateSQLString(document, testPos, processedRanges, diagnostics);

                        // Only check the first quote we find after this function
                        offset = 999; // Break outer loop
                        break;
                    }
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private checkAndValidateSQLString(
        document: vscode.TextDocument,
        position: vscode.Position,
        processedRanges: Set<string>,
        diagnostics: vscode.Diagnostic[]
    ): void {
        const sqlContext = SQLStringDetector.isInsideSQLString(document, position);

        if (!sqlContext) {
            return;
        }

        // Skip if we've already processed this SQL string
        const rangeKey = `${sqlContext.range.start.line}:${sqlContext.range.start.character}-${sqlContext.range.end.line}:${sqlContext.range.end.character}`;
        if (processedRanges.has(rangeKey)) {
            return;
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

    private isValidSelectExpression(query: string): boolean {
        // Allow simple expressions like SELECT 1, SELECT NOW(), etc.
        return /SELECT\s+[\d\w()'",\s]+$/i.test(query.trim());
    }

    dispose() {
        this.diagnosticCollection.dispose();
    }
}
