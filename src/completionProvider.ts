import * as vscode from 'vscode';
import { SQLStringDetector } from './sqlStringDetector';
import { getFunctionCompletions, getKeywordCompletions } from './duckdbFunctions';
import { SchemaProvider, FunctionProvider } from './types';

export class SQLCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private schemaProvider: SchemaProvider & Partial<FunctionProvider>) { }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | null> {
    // Check if we're inside a SQL string
    const sqlContext = SQLStringDetector.isInsideSQLString(document, position);

    if (!sqlContext) {
      return null;
    }

    // Get text before cursor in the SQL string
    const textBeforeCursor = this.getTextBeforeCursor(document, position, sqlContext.range);

    // If this is a glue string, check if cursor is inside an interpolation block
    if (sqlContext.isGlueString) {
      const cursorOffset = SQLStringDetector.getSQLCursorPosition(document, position, sqlContext);
      if (SQLStringDetector.isInsideGlueInterpolation(sqlContext.query, cursorOffset)) {
        // Cursor is inside {}, let R handle completions
        return null;
      }
    }

    const completions: vscode.CompletionItem[] = [];

    // Check if we're typing after a dot (table.column scenario)
    if (this.isDotCompletion(textBeforeCursor)) {
      const tableName = this.getTableNameBeforeDot(textBeforeCursor);
      completions.push(...this.getColumnCompletions(tableName));
    }
    // Context-aware: After FROM keyword, show only tables
    else if (this.isAfterFromKeyword(textBeforeCursor)) {
      completions.push(...this.getTableCompletions());
    }
    // Context-aware: After SELECT, prioritize columns over everything else
    else if (this.isAfterSelectKeyword(textBeforeCursor)) {
      completions.push(...this.getAllColumnCompletions());
      if (this.schemaProvider.getAllFunctions) {
        completions.push(...this.getDynamicFunctionCompletions());
      } else {
        completions.push(...getFunctionCompletions());
      }
      completions.push(...getKeywordCompletions());
      completions.push(...this.getTableCompletions());
    }
    // Context-aware: After JOIN, show only tables
    else if (this.isAfterJoinKeyword(textBeforeCursor)) {
      completions.push(...this.getTableCompletions());
    }
    // Context-aware: After WHERE, prioritize columns (especially from the queried table)
    else if (this.isAfterWhereKeyword(textBeforeCursor)) {
      // Try to get the table name from the FROM clause
      const tableName = this.getTableFromQuery(textBeforeCursor);
      if (tableName && this.schemaProvider.isConnected()) {
        // Show columns from that specific table first
        completions.push(...this.getColumnCompletions(tableName));
      }
      // Then show all columns
      completions.push(...this.getAllColumnCompletions());
      // Then functions and keywords
      if (this.schemaProvider.getAllFunctions) {
        completions.push(...this.getDynamicFunctionCompletions());
      } else {
        completions.push(...getFunctionCompletions());
      }
      completions.push(...getKeywordCompletions());
    }
    else {
      // General completions - all the things!
      // Use dynamic functions if available (from CLI provider), otherwise use hardcoded ones
      if (this.schemaProvider.getAllFunctions) {
        completions.push(...this.getDynamicFunctionCompletions());
      } else {
        completions.push(...getFunctionCompletions());
      }
      completions.push(...getKeywordCompletions());
      completions.push(...this.getTableCompletions());
      completions.push(...this.getAllColumnCompletions());
    }

    return completions;
  }

  /**
   * Get dynamic function completions from DuckDB
   * This includes ALL functions, including those from extensions!
   */
  private getDynamicFunctionCompletions(): vscode.CompletionItem[] {
    if (!this.schemaProvider.getAllFunctions) {
      return [];
    }

    const functions = this.schemaProvider.getAllFunctions();

    return functions.map(func => {
      const item = new vscode.CompletionItem(func.function_name, vscode.CompletionItemKind.Function);
      item.detail = `${func.function_type} function`;

      // Build documentation from function metadata
      let doc = `**${func.function_name}**\n\n`;

      if (func.description) {
        doc += `${func.description}\n\n`;
      }

      if (func.parameters) {
        doc += `**Parameters:** ${func.parameters}\n\n`;
      }

      if (func.return_type) {
        doc += `**Returns:** ${func.return_type}\n\n`;
      }

      doc += `**Type:** ${func.function_type}`;

      item.documentation = new vscode.MarkdownString(doc);

      // Add function call snippet with parentheses
      item.insertText = new vscode.SnippetString(`${func.function_name}($1)$0`);

      item.sortText = `1_${func.function_name}`;
      return item;
    });
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
   * Check if cursor is after FROM keyword (table context)
   */
  private isAfterFromKeyword(text: string): boolean {
    // Match FROM keyword followed by optional whitespace, not followed by a complete table name
    return /\bFROM\s+[\w_]*$/i.test(text);
  }

  /**
   * Check if cursor is after SELECT keyword (column context)
   */
  private isAfterSelectKeyword(text: string): boolean {
    // Match SELECT keyword at the start or after a comma in SELECT list
    // This handles: "SELECT ", "SELECT col1, ", etc.
    const afterSelect = /\bSELECT\s+(?!.*\bFROM\b)[\w_,\s()]*$/i.test(text);
    const afterCommaInSelect = /\bSELECT\b[^;]*,\s*[\w_]*$/i.test(text) && !/\bFROM\b/i.test(text.split(/\bSELECT\b/i).pop() || '');
    return afterSelect || afterCommaInSelect;
  }

  /**
   * Check if cursor is after JOIN keyword (table context)
   */
  private isAfterJoinKeyword(text: string): boolean {
    // Match various JOIN keywords: JOIN, INNER JOIN, LEFT JOIN, RIGHT JOIN, etc.
    return /\b(INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+)?JOIN\s+[\w_]*$/i.test(text);
  }

  /**
   * Check if cursor is after WHERE keyword (column context)
   */
  private isAfterWhereKeyword(text: string): boolean {
    // Match WHERE keyword followed by optional whitespace and column name being typed
    // Also handle: WHERE col1 = 'value' AND/OR
    const afterWhere = /\bWHERE\s+[\w_]*$/i.test(text);
    const afterWhereOperator = /\bWHERE\b[^;]*\b(AND|OR)\s+[\w_]*$/i.test(text);
    return afterWhere || afterWhereOperator;
  }

  /**
   * Extract table name from FROM clause in the query
   */
  private getTableFromQuery(text: string): string | null {
    // Try to find FROM tablename
    const match = text.match(/\bFROM\s+([\w_]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get table name completions
   */
  private getTableCompletions(): vscode.CompletionItem[] {
    if (!this.schemaProvider.isConnected()) {
      return [];
    }

    const tables = this.schemaProvider.getTableNames();

    return tables.map(tableName => {
      const item = new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Class);
      item.detail = 'Table';

      // Add column info to documentation
      const columns = this.schemaProvider.getColumns(tableName);
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
    if (!this.schemaProvider.isConnected()) {
      return [];
    }

    const columns = this.schemaProvider.getColumns(tableName);

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
    if (!this.schemaProvider.isConnected()) {
      return [];
    }

    const allColumns = this.schemaProvider.getAllColumns();

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
