import * as vscode from 'vscode';
import { SQLStringDetector } from './sqlStringDetector';
import { getKeywordCompletions } from './sqlKeywords';
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
    // Context-aware: After FROM keyword, prioritize tables
    else if (this.isAfterFromKeyword(textBeforeCursor)) {
      completions.push(...this.getTableCompletions('0')); // Tables first
    }
    // Context-aware: After FROM tablename, prioritize keywords (WHERE, JOIN, etc.)
    else if (this.isAfterFromTable(textBeforeCursor)) {
      completions.push(...getKeywordCompletions('0')); // Keywords first (WHERE, JOIN, ORDER BY, etc.)
      completions.push(...this.getFunctionCompletions('1')); // Functions second
      // Show columns from all tables in query (FROM + JOINs)
      const columnsFromTables = this.getColumnsFromQueryTables(textBeforeCursor, '2');
      if (columnsFromTables.length > 0) {
        completions.push(...columnsFromTables);
      } else {
        completions.push(...this.getAllColumnCompletions('2'));
      }
      completions.push(...this.getTableCompletions('3')); // Tables last (for JOIN)
    }
    // Context-aware: After SELECT, prioritize columns over everything else
    else if (this.isAfterSelectKeyword(textBeforeCursor)) {
      // If FROM clause exists, show columns from all tables (FROM + JOINs)
      const columnsFromTables = this.getColumnsFromQueryTables(textBeforeCursor, '0');
      if (columnsFromTables.length > 0) {
        completions.push(...columnsFromTables); // Columns from query tables
      } else {
        completions.push(...this.getAllColumnCompletions('0')); // All columns if no FROM yet
      }
      completions.push(...this.getFunctionCompletions('1')); // Functions second
      completions.push(...getKeywordCompletions('2')); // Keywords third
      completions.push(...this.getTableCompletions('3')); // Tables last
    }
    // Context-aware: After JOIN, prioritize tables
    else if (this.isAfterJoinKeyword(textBeforeCursor)) {
      completions.push(...this.getTableCompletions('0')); // Tables first
    }
    // Context-aware: After WHERE, prioritize columns (from all tables in query)
    else if (this.isAfterWhereKeyword(textBeforeCursor)) {
      // Show columns from all tables in query (FROM + JOINs)
      const columnsFromTables = this.getColumnsFromQueryTables(textBeforeCursor, '0');
      if (columnsFromTables.length > 0) {
        completions.push(...columnsFromTables);
      } else {
        completions.push(...this.getAllColumnCompletions('0'));
      }
      // Then functions and keywords
      completions.push(...this.getFunctionCompletions('1'));
      completions.push(...getKeywordCompletions('2'));
    }
    else {
      // General completions - all the things!
      completions.push(...this.getFunctionCompletions());
      completions.push(...getKeywordCompletions());
      completions.push(...this.getTableCompletions());
      completions.push(...this.getAllColumnCompletions());
    }

    // Return as CompletionList for better control over behavior
    return new vscode.CompletionList(completions, false);
  }

  /**
   * Get function completions from DuckDB
   * This includes ALL functions, including those from extensions!
   */
  private getFunctionCompletions(sortPrefix: string = '1'): vscode.CompletionItem[] {
    const functions = this.schemaProvider.getAllFunctions?.() || [];

    // Filter out internal/system functions
    const userFunctions = functions.filter(func => {
      const name = func.function_name;
      // Exclude functions starting with !, __, %, or internal prefixes
      return !name.startsWith('!') &&
             !name.startsWith('__') &&
             !name.startsWith('%') &&
             !name.startsWith('pg_') &&
             !name.startsWith('pragma_');
    });

    return userFunctions.map(func => {
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

      item.sortText = `${sortPrefix}_${func.function_name}`;
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
   * Check if cursor is after FROM tablename (expecting WHERE, JOIN, etc.)
   */
  private isAfterFromTable(text: string): boolean {
    // Check if we have FROM followed by a table name, and we're not in any other clause yet
    // This should match when cursor is after the table name, ready for WHERE/JOIN/etc.

    // First, check we have FROM with a table name
    if (!/\bFROM\s+[\w_]+/i.test(text)) {
      return false;
    }

    // Extract everything after the last FROM clause
    const afterFrom = text.split(/\bFROM\s+/i).pop() || '';

    // Check if we have: tablename (+ optional whitespace + optional partial keyword)
    // But NOT if there's already a complete WHERE, JOIN, etc.
    const match = afterFrom.match(/^([\w_]+)(\s+[\w_]*)?$/i);
    if (!match) {
      return false;
    }

    const tableName = match[1];
    const afterTable = match[2] || '';

    // If there's text after the table, check if it's a complete clause keyword
    if (afterTable.trim()) {
      const wordAfterTable = afterTable.trim();
      if (/^(WHERE|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|ORDER|GROUP|LIMIT|HAVING|ON|AND|OR)$/i.test(wordAfterTable)) {
        // It's a complete keyword, let specific handlers deal with it
        return false;
      }
      // Otherwise it's a partial keyword being typed (like "WHE"), we want to match
      return true;
    }

    // Just whitespace after table name, we're ready for keywords
    return true;
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
    const tables = this.getTablesFromQuery(text);
    return tables.length > 0 ? tables[0] : null;
  }

  /**
   * Extract all table names from FROM and JOIN clauses
   * Handles aliases: "FROM quakes AS q", "FROM quakes q", "JOIN penguins p"
   */
  private getTablesFromQuery(text: string): string[] {
    const tables: string[] = [];

    // Match FROM tablename [AS alias] or FROM tablename alias
    const fromMatch = text.match(/\bFROM\s+([\w_]+)(?:\s+(?:AS\s+)?([\w_]+))?/i);
    if (fromMatch) {
      tables.push(fromMatch[1]); // The actual table name (not the alias)
    }

    // Match all JOIN clauses: JOIN tablename [AS alias] or JOIN tablename alias
    const joinPattern = /\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|OUTER\s+|CROSS\s+)?JOIN\s+([\w_]+)(?:\s+(?:AS\s+)?([\w_]+))?/gi;
    let joinMatch;
    while ((joinMatch = joinPattern.exec(text)) !== null) {
      tables.push(joinMatch[1]); // The actual table name (not the alias)
    }

    return tables;
  }

  /**
   * Get columns from all tables in the query (FROM + JOINs)
   */
  private getColumnsFromQueryTables(text: string, sortPrefix: string = '0'): vscode.CompletionItem[] {
    const tables = this.getTablesFromQuery(text);

    if (tables.length === 0 || !this.schemaProvider.isConnected()) {
      return [];
    }

    const allColumns: vscode.CompletionItem[] = [];

    for (const tableName of tables) {
      const columns = this.getColumnCompletions(tableName, sortPrefix);
      allColumns.push(...columns);
    }

    return allColumns;
  }

  /**
   * Get table name completions
   */
  private getTableCompletions(sortPrefix: string = '3'): vscode.CompletionItem[] {
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

      item.sortText = `${sortPrefix}_${tableName}`;
      return item;
    });
  }

  /**
   * Get column completions for a specific table
   */
  private getColumnCompletions(tableName: string, sortPrefix: string = '0'): vscode.CompletionItem[] {
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
      item.sortText = `${sortPrefix}_${column.name}`;
      return item;
    });
  }

  /**
   * Get all column completions from all tables
   */
  private getAllColumnCompletions(sortPrefix: string = '4'): vscode.CompletionItem[] {
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
      item.sortText = `${sortPrefix}_${column.name}`;
      return item;
    });
  }
}
