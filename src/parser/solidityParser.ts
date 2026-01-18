import * as parser from '@solidity-parser/parser';
import { ASTNode, SourceUnit } from '@solidity-parser/parser/dist/src/ast-types';
import {
    ParsedFile,
    ContractInfo,
    FunctionInfo,
    StructInfo,
    EnumInfo,
    ParameterInfo,
    StructMember,
    StateVariableInfo,
    ImportInfo,
    SourceLocation
} from '../types';
import { ASTTraverser } from './astTraverser';

export class SolidityParser {
    private cache: Map<string, ParsedFile> = new Map();

    /**
     * Parse a Solidity source file into a structured format
     */
    parse(sourceCode: string, filePath: string): ParsedFile {
        // Check cache first
        const cacheKey = `${filePath}:${this.hashCode(sourceCode)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        const ast = parser.parse(sourceCode, {
            loc: true,
            range: true,
            tolerant: true
        });

        const parsedFile = this.processAST(ast, sourceCode, filePath);
        this.cache.set(cacheKey, parsedFile);
        return parsedFile;
    }

    /**
     * Get the raw AST for advanced analysis
     */
    parseRaw(sourceCode: string): SourceUnit {
        return parser.parse(sourceCode, {
            loc: true,
            range: true,
            tolerant: true
        });
    }

    /**
     * Clear the parser cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    private processAST(ast: SourceUnit, sourceCode: string, filePath: string): ParsedFile {
        const contracts: ContractInfo[] = [];
        const imports: ImportInfo[] = [];
        const pragmas: string[] = [];
        const lines = sourceCode.split('\n');

        for (const node of ast.children) {
            if (node.type === 'PragmaDirective') {
                pragmas.push(`pragma ${node.name} ${node.value};`);
            } else if (node.type === 'ImportDirective') {
                imports.push(this.processImport(node));
            } else if (
                node.type === 'ContractDefinition'
            ) {
                contracts.push(this.processContract(node, sourceCode, lines, filePath));
            }
        }

        return {
            filePath,
            contracts,
            imports,
            pragmas
        };
    }

    private processImport(node: ASTNode & { type: 'ImportDirective' }): ImportInfo {
        const importNode = node as any;
        return {
            path: importNode.path,
            absolutePath: importNode.absolutePath || null,
            symbols: importNode.symbolAliases?.map((s: any) => s[0]) || []
        };
    }

    private processContract(
        node: ASTNode & { type: 'ContractDefinition' },
        sourceCode: string,
        lines: string[],
        filePath: string
    ): ContractInfo {
        const contractNode = node as any;
        const functions: FunctionInfo[] = [];
        const structs: StructInfo[] = [];
        const enums: EnumInfo[] = [];
        const stateVariables: StateVariableInfo[] = [];

        for (const subNode of contractNode.subNodes || []) {
            if (subNode.type === 'FunctionDefinition') {
                functions.push(this.processFunction(subNode, sourceCode, lines, filePath));
            } else if (subNode.type === 'StructDefinition') {
                structs.push(this.processStruct(subNode, sourceCode, lines, filePath, contractNode.name));
            } else if (subNode.type === 'EnumDefinition') {
                enums.push(this.processEnum(subNode, sourceCode, lines, filePath, contractNode.name));
            } else if (subNode.type === 'StateVariableDeclaration') {
                stateVariables.push(...this.processStateVariable(subNode, lines));
            }
        }

        return {
            name: contractNode.name,
            kind: contractNode.kind || 'contract',
            functions,
            structs,
            enums,
            stateVariables,
            location: this.extractLocation(contractNode),
            filePath
        };
    }

    private processFunction(
        node: any,
        sourceCode: string,
        lines: string[],
        filePath: string
    ): FunctionInfo {
        const location = this.extractLocation(node);
        const fullSource = this.extractSource(location, lines);
        
        // Extract function body
        let body = '';
        if (node.body && node.body.loc) {
            const bodyLocation = this.extractLocation(node.body);
            body = this.extractSource(bodyLocation, lines);
        }

        return {
            name: node.name || (node.isConstructor ? 'constructor' : node.isFallback ? 'fallback' : 'receive'),
            visibility: node.visibility || 'public',
            stateMutability: node.stateMutability || null,
            parameters: this.processParameters(node.parameters || []),
            returnParameters: this.processParameters(node.returnParameters || []),
            modifiers: (node.modifiers || []).map((m: any) => m.name),
            body,
            fullSource,
            location,
            filePath
        };
    }

    private processParameters(params: any[]): ParameterInfo[] {
        return params.map((param: any) => ({
            name: param.name || '',
            typeName: this.typeNameToString(param.typeName),
            storageLocation: param.storageLocation || null
        }));
    }

    private processStruct(
        node: any,
        sourceCode: string,
        lines: string[],
        filePath: string,
        contractName: string | null
    ): StructInfo {
        const location = this.extractLocation(node);
        const members: StructMember[] = (node.members || []).map((m: any) => ({
            name: m.name,
            typeName: this.typeNameToString(m.typeName)
        }));

        return {
            name: node.name,
            members,
            fullSource: this.extractSource(location, lines),
            location,
            filePath,
            contractName
        };
    }

    private processEnum(
        node: any,
        sourceCode: string,
        lines: string[],
        filePath: string,
        contractName: string | null
    ): EnumInfo {
        const location = this.extractLocation(node);
        const members = (node.members || []).map((m: any) => m.name);

        return {
            name: node.name,
            members,
            fullSource: this.extractSource(location, lines),
            location,
            filePath,
            contractName
        };
    }

    private processStateVariable(node: any, lines: string[]): StateVariableInfo[] {
        return (node.variables || []).map((v: any) => ({
            name: v.name,
            typeName: this.typeNameToString(v.typeName),
            visibility: v.visibility || 'internal',
            location: this.extractLocation(v)
        }));
    }

    private typeNameToString(typeName: any): string {
        if (!typeName) return 'unknown';

        switch (typeName.type) {
            case 'ElementaryTypeName':
                return typeName.name;
            case 'UserDefinedTypeName':
                return typeName.namePath;
            case 'ArrayTypeName':
                const baseType = this.typeNameToString(typeName.baseTypeName);
                const length = typeName.length ? typeName.length.number : '';
                return `${baseType}[${length}]`;
            case 'Mapping':
                const keyType = this.typeNameToString(typeName.keyType);
                const valueType = this.typeNameToString(typeName.valueType);
                return `mapping(${keyType} => ${valueType})`;
            case 'FunctionTypeName':
                return 'function';
            default:
                return typeName.name || 'unknown';
        }
    }

    private extractLocation(node: any): SourceLocation {
        if (!node.loc) {
            return {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 0 }
            };
        }
        return {
            start: {
                line: node.loc.start.line,
                column: node.loc.start.column
            },
            end: {
                line: node.loc.end.line,
                column: node.loc.end.column
            }
        };
    }

    private extractSource(location: SourceLocation, lines: string[]): string {
        const startLine = location.start.line - 1;
        const endLine = location.end.line - 1;

        if (startLine === endLine) {
            return lines[startLine]?.substring(location.start.column, location.end.column) || '';
        }

        const result: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            if (i === startLine) {
                result.push(lines[i]?.substring(location.start.column) || '');
            } else if (i === endLine) {
                result.push(lines[i]?.substring(0, location.end.column) || '');
            } else {
                result.push(lines[i] || '');
            }
        }
        return result.join('\n');
    }

    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
}
