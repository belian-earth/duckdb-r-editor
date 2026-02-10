# Makefile for DuckDB R Editor VSCode Extension

.PHONY: all build compile lint package clean install functions help

# Default target - build and package
all: build package

# Build the extension (compile + lint)
build: compile lint

# Compile TypeScript to JavaScript
compile:
	@echo "Compiling TypeScript..."
	@npm run compile

# Run linter
lint:
	@echo "Running linter..."
	@npm run lint

# Package extension into .vsix file
package:
	@echo "Packaging extension..."
	@npm run vsce:package
	@echo "✓ Package created: duckdb-r-editor-*.vsix"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf out/
	@rm -f *.vsix
	@echo "✓ Clean complete"

# Install dependencies
install:
	@echo "Installing dependencies..."
	@npm install

# Rebuild from scratch
rebuild: clean install build package

# Regenerate data/duckdb-functions.json (dev only, requires duckdb npm module)
functions:
	@echo "Generating DuckDB function list..."
	@npm run generate-functions
	@echo "✓ Function list updated"

# Quick build and package (for rapid iteration)
quick: compile package

# Show help
help:
	@echo "DuckDB R Editor - Build Commands"
	@echo ""
	@echo "  make              - Build and package (default)"
	@echo "  make build        - Compile and lint"
	@echo "  make compile      - Compile TypeScript"
	@echo "  make lint         - Run ESLint"
	@echo "  make package      - Create .vsix package"
	@echo "  make functions     - Regenerate DuckDB function list (dev only)"
	@echo "  make quick        - Quick compile + package (skip lint)"
	@echo "  make clean        - Remove build artifacts"
	@echo "  make install      - Install npm dependencies"
	@echo "  make rebuild      - Clean rebuild from scratch"
	@echo "  make help         - Show this help message"
