import * as vscode from 'vscode';
import { SQLStringDetector } from './sqlStringDetector';

/**
 * Provides background color decorations for SQL strings in R code
 * Theme-aware with user-configurable colors
 */
export class SQLBackgroundDecorator implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType | null = null;
  private disposables: vscode.Disposable[] = [];
  private updateTimeout: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 100;

  constructor() {
    // Create initial decoration type
    this.updateDecorationType();

    // Listen to configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('duckdb-r-editor.enableSQLBackground') ||
          e.affectsConfiguration('duckdb-r-editor.sqlBackgroundColor')) {
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

    const config = vscode.workspace.getConfiguration('duckdb-r-editor');
    const enabled = config.get<boolean>('enableSQLBackground', true);

    if (!enabled) {
      return;
    }

    const customColor = config.get<string>('sqlBackgroundColor', '');
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
        // Warm blue-tinted background for light themes - database/SQL association
        return 'rgba(230, 195, 100, 0.3)';

      case vscode.ColorThemeKind.Dark:
      case vscode.ColorThemeKind.HighContrast:
      default:
        // Cool blue highlight for dark themes - classy and noticeable
        return 'rgba(247, 222, 153, 0.2)';
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
   */
  private decorateEditor(editor: vscode.TextEditor): void {
    if (!this.decorationType) {
      // Clear any existing decorations if feature is disabled
      return;
    }

    const document = editor.document;
    const sqlRanges: vscode.Range[] = [];
    const processedRanges = new Set<string>();

    // Scan entire document for SQL strings
    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;

      // Look for quote characters that might start SQL strings
      for (let charPos = 0; charPos < lineText.length; charPos++) {
        const char = lineText[charPos];
        if (char === '"' || char === "'" || char === '`') {
          // Check if escaped
          if (charPos > 0 && lineText[charPos - 1] === '\\') {
            continue;
          }

          const position = new vscode.Position(lineNum, charPos + 1);
          const context = SQLStringDetector.isInsideSQLString(document, position);

          if (context) {
            // Create unique key for this range to avoid duplicates
            const rangeKey = `${context.range.start.line}:${context.range.start.character}-${context.range.end.line}:${context.range.end.character}`;

            if (!processedRanges.has(rangeKey)) {
              processedRanges.add(rangeKey);

              // Add range including quotes for better visual effect
              const rangeWithQuotes = new vscode.Range(
                new vscode.Position(context.range.start.line, context.range.start.character - 1),
                new vscode.Position(context.range.end.line, context.range.end.character + 1)
              );
              sqlRanges.push(rangeWithQuotes);
            }

            // Skip ahead to avoid re-processing this string
            if (context.range.end.line === lineNum) {
              charPos = context.range.end.character;
            } else {
              // Multi-line string, jump to end line
              lineNum = context.range.end.line;
              break;
            }
          }
        }
      }
    }

    // Apply decorations
    editor.setDecorations(this.decorationType, sqlRanges);
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
