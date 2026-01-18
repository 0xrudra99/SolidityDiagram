import * as vscode from 'vscode';
import { SolidityParser } from '../parser/solidityParser';
import { ASTTraverser } from '../parser/astTraverser';
import {
    FunctionInfo,
    FunctionAnalysis,
    FunctionCallInfo,
    TypeReference,
    StructInfo,
    EnumInfo,
    ParsedFile,
    SourceLocation
} from '../types';
import { TypeResolver } from './typeResolver';
import { CallGraphBuilder } from './callGraphBuilder';

export class FunctionAnalyzer {
    private parser: SolidityParser;
    private traverser: ASTTraverser;
    private typeResolver: TypeResolver;
    private callGraphBuilder: CallGraphBuilder;

    constructor(parser: SolidityParser) {
        this.parser = parser;
        this.traverser = new ASTTraverser();
        this.typeResolver = new TypeResolver(parser);
        this.callGraphBuilder = new CallGraphBuilder(parser);
    }

    /**
     * Analyze a function at the given cursor position
     */
    async analyze(
        sourceCode: string,
        filePath: string,
        position: vscode.Position
    ): Promise<FunctionAnalysis | null> {
        // Parse the source file
        const parsedFile = this.parser.parse(sourceCode, filePath);
        
        // Find the function at the cursor position
        const functionInfo = this.findFunctionAtPosition(parsedFile, position);
        if (!functionInfo) {
            return null;
        }

        // Get all files in the workspace for cross-file resolution
        const workspaceFiles = await this.getWorkspaceFiles(filePath);

        // Resolve referenced types
        const referencedTypes = await this.typeResolver.resolveTypes(
            functionInfo,
            parsedFile,
            workspaceFiles
        );

        // Build call graph for inner calls
        const innerCalls = await this.callGraphBuilder.buildCallGraph(
            functionInfo,
            parsedFile,
            workspaceFiles
        );

        return {
            function: functionInfo,
            referencedTypes,
            innerCalls
        };
    }

    /**
     * Find the function definition at a specific cursor position
     */
    private findFunctionAtPosition(
        parsedFile: ParsedFile,
        position: vscode.Position
    ): FunctionInfo | null {
        const line = position.line + 1; // VS Code uses 0-based lines
        const column = position.character;

        for (const contract of parsedFile.contracts) {
            for (const func of contract.functions) {
                if (this.isPositionInLocation(line, column, func.location)) {
                    return func;
                }
            }
        }

        return null;
    }

    /**
     * Check if a position is within a source location
     */
    private isPositionInLocation(
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
     * Get all Solidity files in the workspace
     */
    private async getWorkspaceFiles(currentFilePath: string): Promise<Map<string, ParsedFile>> {
        const files = new Map<string, ParsedFile>();
        
        // Get all .sol files in the workspace
        const solFiles = await vscode.workspace.findFiles('**/*.sol', '**/node_modules/**');
        
        for (const uri of solFiles) {
            try {
                const document = await vscode.workspace.openTextDocument(uri);
                const sourceCode = document.getText();
                const parsed = this.parser.parse(sourceCode, uri.fsPath);
                files.set(uri.fsPath, parsed);
            } catch (error) {
                // Skip files that can't be parsed
                console.warn(`Failed to parse ${uri.fsPath}:`, error);
            }
        }

        return files;
    }

    /**
     * Extract all type names referenced in a function
     */
    extractTypeNames(functionInfo: FunctionInfo): string[] {
        const types = new Set<string>();

        // Extract from parameters
        for (const param of functionInfo.parameters) {
            this.extractTypesFromTypeName(param.typeName, types);
        }

        // Extract from return parameters
        for (const param of functionInfo.returnParameters) {
            this.extractTypesFromTypeName(param.typeName, types);
        }

        // Parse the function body to find type references
        // This is handled by the type resolver for more accuracy

        return Array.from(types);
    }

    /**
     * Extract user-defined type names from a type string
     */
    private extractTypesFromTypeName(typeName: string, types: Set<string>): void {
        // Skip elementary types
        const elementaryTypes = [
            'address', 'bool', 'string', 'bytes',
            'uint', 'int', 'uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256',
            'int8', 'int16', 'int32', 'int64', 'int128', 'int256',
            'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
            'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
            'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
            'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
            'function', 'unknown'
        ];

        // Handle mapping types
        const mappingMatch = typeName.match(/mapping\((.+?) => (.+)\)/);
        if (mappingMatch) {
            this.extractTypesFromTypeName(mappingMatch[1], types);
            this.extractTypesFromTypeName(mappingMatch[2], types);
            return;
        }

        // Handle array types
        const arrayMatch = typeName.match(/^(.+?)\[.*\]$/);
        if (arrayMatch) {
            this.extractTypesFromTypeName(arrayMatch[1], types);
            return;
        }

        // Handle contract.type notation
        const parts = typeName.split('.');
        const baseType = parts[parts.length - 1];

        if (!elementaryTypes.includes(baseType.toLowerCase())) {
            types.add(typeName);
        }
    }
}
