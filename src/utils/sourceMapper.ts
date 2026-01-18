import * as vscode from 'vscode';
import * as path from 'path';
import { SourceLocation } from '../types';

/**
 * Utility class for mapping between source code positions and AST nodes
 */
export class SourceMapper {
    /**
     * Extract a section of source code based on location
     */
    static extractSource(
        sourceCode: string,
        location: SourceLocation,
        options: { includeContext?: number } = {}
    ): string {
        const lines = sourceCode.split('\n');
        const { includeContext = 0 } = options;

        const startLine = Math.max(0, location.start.line - 1 - includeContext);
        const endLine = Math.min(lines.length - 1, location.end.line - 1 + includeContext);

        const extractedLines: string[] = [];

        for (let i = startLine; i <= endLine; i++) {
            const line = lines[i];
            if (i === location.start.line - 1 && i === location.end.line - 1) {
                // Single line extraction
                extractedLines.push(line.substring(location.start.column, location.end.column));
            } else if (i === location.start.line - 1) {
                extractedLines.push(line.substring(location.start.column));
            } else if (i === location.end.line - 1) {
                extractedLines.push(line.substring(0, location.end.column));
            } else {
                extractedLines.push(line);
            }
        }

        return extractedLines.join('\n');
    }

    /**
     * Extract full lines of source code based on location
     */
    static extractFullLines(
        sourceCode: string,
        location: SourceLocation,
        options: { includeContext?: number } = {}
    ): string {
        const lines = sourceCode.split('\n');
        const { includeContext = 0 } = options;

        const startLine = Math.max(0, location.start.line - 1 - includeContext);
        const endLine = Math.min(lines.length - 1, location.end.line - 1 + includeContext);

        return lines.slice(startLine, endLine + 1).join('\n');
    }

    /**
     * Check if a position is within a location
     */
    static isPositionInLocation(
        line: number,
        column: number,
        location: SourceLocation
    ): boolean {
        if (line < location.start.line || line > location.end.line) {
            return false;
        }

        if (line === location.start.line && column < location.start.column) {
            return false;
        }

        if (line === location.end.line && column > location.end.column) {
            return false;
        }

        return true;
    }

    /**
     * Get relative file path from workspace
     */
    static getRelativePath(absolutePath: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return path.basename(absolutePath);
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        if (absolutePath.startsWith(workspaceRoot)) {
            return path.relative(workspaceRoot, absolutePath);
        }

        return absolutePath;
    }

    /**
     * Resolve an import path to an absolute path
     */
    static async resolveImportPath(
        importPath: string,
        currentFilePath: string
    ): Promise<string | null> {
        // Handle relative imports
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const currentDir = path.dirname(currentFilePath);
            const resolvedPath = path.resolve(currentDir, importPath);
            
            // Try with .sol extension if not present
            const pathWithExt = resolvedPath.endsWith('.sol') 
                ? resolvedPath 
                : resolvedPath + '.sol';
            
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(pathWithExt));
                return pathWithExt;
            } catch {
                return null;
            }
        }

        // Handle node_modules or other package imports
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        // Search in common locations
        const searchPaths = [
            path.join(workspaceFolders[0].uri.fsPath, 'node_modules', importPath),
            path.join(workspaceFolders[0].uri.fsPath, 'lib', importPath),
            path.join(workspaceFolders[0].uri.fsPath, importPath)
        ];

        for (const searchPath of searchPaths) {
            const pathWithExt = searchPath.endsWith('.sol') 
                ? searchPath 
                : searchPath + '.sol';
            
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(pathWithExt));
                return pathWithExt;
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * Find the enclosing function or contract for a position
     */
    static findEnclosingScope(
        sourceCode: string,
        line: number,
        column: number
    ): { type: 'function' | 'contract' | 'none'; name: string } {
        // Simple heuristic: look backwards for function or contract keyword
        const lines = sourceCode.split('\n');
        
        for (let i = line - 1; i >= 0; i--) {
            const currentLine = lines[i];
            
            const functionMatch = currentLine.match(/function\s+(\w+)/);
            if (functionMatch) {
                return { type: 'function', name: functionMatch[1] };
            }

            const contractMatch = currentLine.match(/(?:contract|interface|library)\s+(\w+)/);
            if (contractMatch) {
                return { type: 'contract', name: contractMatch[1] };
            }
        }

        return { type: 'none', name: '' };
    }
}
