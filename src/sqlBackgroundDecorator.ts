import * as vscode from 'vscode';
import { SQLStringDetector } from './sqlStringDetector';
import { EXTENSION_ID, CONFIG_KEYS } from './constants';
import { SQL_FUNCTION_NAMES, PARSING_LIMITS } from './types';
import { ParenMatcher } from './utils/parenMatcher';

/**
 * Provides background color decorations for SQL strings in R code
 * Theme-aware with user-configurable colors
 */
export class SQLBackgroundDecorator implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType | null = null;
  private disposables: vscode.Disposable[] = [];
  private updateTimeout: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 100;

  // Theme-specific background colors
  private static readonly LIGHT_THEME_BG_COLOR = 'rgba(109, 255, 243, 0.1)';  // Soft cyan - database/water association
  private static readonly DARK_THEME_BG_COLOR = 'rgba(114, 233, 98, 0.2)';    // Soft green - matrix/terminal aesthetic

  constructor() {
    // Create initial decoration type
    this.updateDecorationType();

    // Listen to configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(`${EXTENSION_ID}.${CONFIG_KEYS.ENABLE_BACKGROUND_COLOR}`) ||
          e.affectsConfiguration(`${EXTENSION_ID}.${CONFIG_KEYS.CUSTOM_BG_COLOR}`)) {
          this.updateDecorationType();
          this.decorateAllVisibleEditors();
        }
      })
    );

    // Listen to theme changes
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.updateDecorationType();
        this.decorateAllVisibleEditors();
      })
    );

    // Listen to document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document === event.document
        );
        if (editor && editor.document.languageId === 'r') {
          this.scheduleDecoration(editor);
        }
      })
    );

    // Listen to active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'r') {
          this.decorateEditor(editor);
        }
      })
    );

    // Decorate all currently visible R editors
    this.decorateAllVisibleEditors();
  }

  /**
   * Update decoration type based on theme and settings
   */
  private updateDecorationType(): void {
    // Dispose old decoration type
    if (this.decorationType) {
      this.decorationType.dispose();
      this.decorationType = null;
    }

    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    const enabled = config.get<boolean>(CONFIG_KEYS.ENABLE_BACKGROUND_COLOR, true);

    if (!enabled) {
      return;
    }

    const customColor = config.get<string>(CONFIG_KEYS.CUSTOM_BG_COLOR, '');
    const backgroundColor = customColor || this.getThemeBasedColor();

    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: backgroundColor,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
  }

  /**
   * Get appropriate background color based on current theme
   */
  private getThemeBasedColor(): string {
    const theme = vscode.window.activeColorTheme;

    switch (theme.kind) {
      case vscode.ColorThemeKind.Light:
      case vscode.ColorThemeKind.HighContrastLight:
        return SQLBackgroundDecorator.LIGHT_THEME_BG_COLOR;

      case vscode.ColorThemeKind.Dark:
      case vscode.ColorThemeKind.HighContrast:
      default:
        return SQLBackgroundDecorator.DARK_THEME_BG_COLOR;
    }
  }

  /**
   * Schedule decoration update with debouncing
   */
  private scheduleDecoration(editor: vscode.TextEditor): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.decorateEditor(editor);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Decorate all visible R editors
   */
  private decorateAllVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'r') {
        this.decorateEditor(editor);
      }
    }
  }

  /**
   * Find all SQL strings in document and apply decorations
   * Uses the same approach as semantic token provider for consistency
   */
  private decorateEditor(editor: vscode.TextEditor): void {
    if (!this.decorationType) {
      // Clear any existing decorations if feature is disabled
      return;
    }

    const document = editor.document;
    const sqlRanges: vscode.Range[] = [];
    const processedRanges = new Set<string>();

    const fullText = document.getText();

    // Limit text processing for very large documents
    if (fullText.length > PARSING_LIMITS.MAX_DOCUMENT_SIZE) {
      return;
    }

    // Find all SQL function calls in the document (same as semantic token provider)
    for (const funcName of SQL_FUNCTION_NAMES) {
      const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const funcPattern = new RegExp(`\\b${escapedName}\\s*\\(`, 'g');

      let match;
      let matchCount = 0;

      while ((match = funcPattern.exec(fullText)) !== null && matchCount < PARSING_LIMITS.MAX_FUNCTION_MATCHES) {
        matchCount++;

        const funcStartOffset = match.index;
        const funcPosition = document.positionAt(funcStartOffset);

        // Skip if this function call is in an R comment
        const lineText = document.lineAt(funcPosition.line).text;
        const lineBeforeFunc = lineText.substring(0, funcPosition.character);
        if (lineBeforeFunc.trim().startsWith('#')) {
          continue;
        }

        // Find the matching closing paren to get the full function call
        const callRange = this.findFunctionCallRange(document, funcPosition);
        if (!callRange) {
          continue;
        }

        // Find all string literals within this function call
        const stringsInCall = this.findStringsInRange(document, callRange);

        for (const stringRange of stringsInCall) {
          // Create unique key for this range
          const rangeKey = `${stringRange.start.line}:${stringRange.start.character}-${stringRange.end.line}:${stringRange.end.character}`;

          if (processedRanges.has(rangeKey)) {
            continue;
          }

          // IMPORTANT: Use SQLStringDetector to verify this is actually a SQL string
          // This filters out named arguments like col_name = "value"
          const sqlContext = SQLStringDetector.isInsideSQLString(document, stringRange.start);
          if (!sqlContext) {
            continue; // Not a SQL string, skip it
          }

          processedRanges.add(rangeKey);

          // For multi-line strings, create per-line decorations to avoid highlighting leading whitespace
          if (stringRange.start.line === stringRange.end.line) {
            // Single line - exclude quotes, just the content
            sqlRanges.push(stringRange);
          } else {
            // Multi-line - create one range per line, trimming leading whitespace
            for (let line = stringRange.start.line; line <= stringRange.end.line; line++) {
              const lineText = document.lineAt(line).text;
              let startChar: number;
              let endChar: number;

              if (line === stringRange.start.line) {
                // First line: start after opening quote
                startChar = stringRange.start.character;
                endChar = lineText.length;
              } else if (line === stringRange.end.line) {
                // Last line: find first non-whitespace character, end before closing quote
                const trimmedStart = lineText.search(/\S/);
                startChar = trimmedStart >= 0 ? trimmedStart : 0;
                endChar = stringRange.end.character;
              } else {
                // Middle line: trim leading whitespace, go to end of line
                const trimmedStart = lineText.search(/\S/);
                startChar = trimmedStart >= 0 ? trimmedStart : 0;
                endChar = lineText.length;
              }

              // Only add range if there's actual content
              if (startChar < endChar) {
                sqlRanges.push(new vscode.Range(
                  new vscode.Position(line, startChar),
                  new vscode.Position(line, endChar)
                ));
              }
            }
          }
        }
      }
    }

    // Apply decorations
    editor.setDecorations(this.decorationType, sqlRanges);
  }

  /**
   * Find the range of a function call (from function name to closing paren)
   * Copied from semantic token provider for consistency
   */
  private findFunctionCallRange(document: vscode.TextDocument, startPos: vscode.Position): vscode.Range | null {
    const startOffset = document.offsetAt(startPos);
    const text = document.getText();

    // Find opening paren
    let i = startOffset;
    let searchCount = 0;

    while (i < text.length && text[i] !== '(' && searchCount < PARSING_LIMITS.MAX_PAREN_SEARCH_DISTANCE) {
      i++;
      searchCount++;
    }

    if (i >= text.length || searchCount >= PARSING_LIMITS.MAX_PAREN_SEARCH_DISTANCE) {
      return null;
    }

    // Find matching closing paren (handling nested parens and strings)
    let depth = 0;
    let inString = false;
    let stringChar = '';

    i++; // Move past opening paren
    const openParenOffset = i;

    while (i < text.length && (i - openParenOffset) < PARSING_LIMITS.MAX_FUNCTION_CALL_LENGTH) {
      const char = text[i];
      const prevChar = i > 0 ? text[i - 1] : '';

      // Handle string literals
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      // Only count parens if not in a string
      if (!inString) {
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          if (depth === 0) {
            // Found the matching closing paren
            return new vscode.Range(
              startPos,
              document.positionAt(i + 1)
            );
          }
          depth--;
        }
      }

      i++;
    }

    // No matching closing paren found within reasonable distance
    return null;
  }

  /**
   * Find all string literals within a given range
   * Copied from semantic token provider for consistency
   */
  private findStringsInRange(document: vscode.TextDocument, range: vscode.Range): vscode.Range[] {
    const strings: vscode.Range[] = [];
    const text = document.getText(range);
    const startOffset = document.offsetAt(range.start);

    let i = 0;
    while (i < text.length) {
      const char = text[i];

      // Check if this is a string start
      if (char === '"' || char === "'" || char === '`') {
        const quoteChar = char;
        const stringStartOffset = startOffset + i;
        const stringStart = document.positionAt(stringStartOffset + 1); // +1 to skip opening quote

        // Find closing quote
        let j = i + 1;
        while (j < text.length) {
          if (text[j] === quoteChar && text[j - 1] !== '\\') {
            // Found closing quote
            const stringEndOffset = startOffset + j;
            const stringEnd = document.positionAt(stringEndOffset);
            strings.push(new vscode.Range(stringStart, stringEnd));
            i = j;
            break;
          }
          j++;
        }
      }

      i++;
    }

    return strings;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    if (this.decorationType) {
      this.decorationType.dispose();
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
