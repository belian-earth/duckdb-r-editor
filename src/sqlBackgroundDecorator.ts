import * as vscode from 'vscode';
import { SQLStringDetector } from './sqlStringDetector';
import { EXTENSION_ID, CONFIG_KEYS } from './constants';
import { SQLRegionFinder } from './utils/sqlRegionFinder';

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
   * Uses shared SQLRegionFinder for consistency with semantic highlighting
   */
  private decorateEditor(editor: vscode.TextEditor): void {
    if (!this.decorationType) {
      // Clear any existing decorations if feature is disabled
      return;
    }

    const document = editor.document;
    const sqlRanges: vscode.Range[] = [];

    // Find all string ranges in SQL functions using shared utility
    const stringRanges = SQLRegionFinder.findSQLFunctionStrings(document);

    // Validate and create decorations for each string
    for (const stringRange of stringRanges) {
      // IMPORTANT: Use SQLStringDetector to verify this is actually a SQL string
      // This filters out named arguments like col_name = "value"
      const sqlContext = SQLStringDetector.isInsideSQLString(document, stringRange.start);
      if (!sqlContext) {
        continue; // Not a SQL string, skip it
      }

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
