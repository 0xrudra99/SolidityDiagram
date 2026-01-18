import { SolidityParser } from '../parser/solidityParser';
import { ASTTraverser } from '../parser/astTraverser';
import {
    FunctionInfo,
    TypeReference,
    StructInfo,
    EnumInfo,
    ParsedFile
} from '../types';

export class TypeResolver {
    private parser: SolidityParser;
    private traverser: ASTTraverser;

    // Elementary types to skip
    private readonly ELEMENTARY_TYPES = new Set([
        'address', 'bool', 'string', 'bytes', 'uint', 'int',
        'uint8', 'uint16', 'uint24', 'uint32', 'uint40', 'uint48', 'uint56', 'uint64',
        'uint72', 'uint80', 'uint88', 'uint96', 'uint104', 'uint112', 'uint120', 'uint128',
        'uint136', 'uint144', 'uint152', 'uint160', 'uint168', 'uint176', 'uint184', 'uint192',
        'uint200', 'uint208', 'uint216', 'uint224', 'uint232', 'uint240', 'uint248', 'uint256',
        'int8', 'int16', 'int24', 'int32', 'int40', 'int48', 'int56', 'int64',
        'int72', 'int80', 'int88', 'int96', 'int104', 'int112', 'int120', 'int128',
        'int136', 'int144', 'int152', 'int160', 'int168', 'int176', 'int184', 'int192',
        'int200', 'int208', 'int216', 'int224', 'int232', 'int240', 'int248', 'int256',
        'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
        'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
        'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
        'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
        'function', 'unknown', 'void', 'var'
    ]);

    // Common keywords and built-ins to skip
    private readonly SKIP_NAMES = new Set([
        'require', 'assert', 'revert', 'keccak256', 'sha256', 'sha3',
        'ripemd160', 'ecrecover', 'addmod', 'mulmod', 'selfdestruct',
        'blockhash', 'gasleft', 'Error', 'Panic', 'abi', 'block',
        'msg', 'tx', 'this', 'super', 'type', 'true', 'false',
        'if', 'else', 'for', 'while', 'do', 'return', 'emit', 'new', 'delete',
        'memory', 'storage', 'calldata', 'public', 'private', 'internal', 'external',
        'pure', 'view', 'payable', 'constant', 'immutable', 'virtual', 'override'
    ]);

    constructor(parser: SolidityParser) {
        this.parser = parser;
        this.traverser = new ASTTraverser();
    }

    /**
     * Resolve all types referenced in a function
     */
    async resolveTypes(
        functionInfo: FunctionInfo,
        currentFile: ParsedFile,
        workspaceFiles: Map<string, ParsedFile>
    ): Promise<TypeReference[]> {
        const typeNames = this.extractAllTypeNames(functionInfo);
        const references: TypeReference[] = [];
        const seenTypes = new Set<string>();

        for (const typeName of typeNames) {
            // Skip if already processed
            const normalizedName = typeName.split('.').pop() || typeName;
            if (seenTypes.has(normalizedName)) continue;
            seenTypes.add(normalizedName);

            const reference = this.resolveType(typeName, currentFile, workspaceFiles);
            if (reference && reference.definition) {
                references.push(reference);
            }
        }

        return references;
    }

    /**
     * Extract all type names from function signature and body
     */
    private extractAllTypeNames(functionInfo: FunctionInfo): Set<string> {
        const types = new Set<string>();

        // 1. Extract from parameters
        for (const param of functionInfo.parameters) {
            this.extractFromTypeName(param.typeName, types);
        }

        // 2. Extract from return parameters
        for (const param of functionInfo.returnParameters) {
            this.extractFromTypeName(param.typeName, types);
        }

        // 3. Deep scan the function body for ALL type references
        this.extractTypesFromBody(functionInfo.fullSource, types);

        return types;
    }

    /**
     * Extract user-defined types from a type name string
     */
    private extractFromTypeName(typeName: string, types: Set<string>): void {
        // Handle mapping types: mapping(KeyType => ValueType)
        const mappingMatch = typeName.match(/mapping\s*\(\s*(.+?)\s*=>\s*(.+)\s*\)/);
        if (mappingMatch) {
            this.extractFromTypeName(mappingMatch[1].trim(), types);
            this.extractFromTypeName(mappingMatch[2].trim(), types);
            return;
        }

        // Handle array types: Type[] or Type[n]
        const arrayMatch = typeName.match(/^(.+?)\s*\[.*\]$/);
        if (arrayMatch) {
            this.extractFromTypeName(arrayMatch[1].trim(), types);
            return;
        }

        // Get the base type name
        const cleanName = typeName.split('.').pop() || typeName;

        // Skip elementary types
        if (this.ELEMENTARY_TYPES.has(cleanName.toLowerCase())) return;

        // Skip common keywords
        if (this.SKIP_NAMES.has(cleanName)) return;

        // Add if it looks like a user-defined type (starts with uppercase)
        if (/^[A-Z]/.test(cleanName)) {
            types.add(typeName);
        }
    }

    /**
     * Extract ALL type references from function body source code
     * This is comprehensive and catches structs/enums used anywhere
     */
    private extractTypesFromBody(sourceCode: string, types: Set<string>): void {
        // Pattern 1: Variable declarations with types
        // e.g., "DepositPool memory depositPool_" or "IRewardPool rewardPool_"
        const varDeclPatterns = [
            /\b([A-Z][a-zA-Z0-9_]*)\s+(?:memory|storage|calldata)\s+\w+/g,
            /\b([A-Z][a-zA-Z0-9_]*)\s+\w+\s*[=;,)]/g,
        ];

        for (const pattern of varDeclPatterns) {
            let match;
            while ((match = pattern.exec(sourceCode)) !== null) {
                this.addTypeIfValid(match[1], types);
            }
        }

        // Pattern 2: Struct instantiation
        // e.g., "DepositPool(token_, chainLinkPath_, ...)" or "DepositPool({...})"
        const structInstPattern = /\b([A-Z][a-zA-Z0-9_]*)\s*\(/g;
        let match;
        while ((match = structInstPattern.exec(sourceCode)) !== null) {
            this.addTypeIfValid(match[1], types);
        }

        // Pattern 3: Enum member access
        // e.g., "Strategy.NO_YIELD" or "Strategy.AAVE"
        const enumAccessPattern = /\b([A-Z][a-zA-Z0-9_]*)\.([A-Z][A-Z0-9_]*)\b/g;
        while ((match = enumAccessPattern.exec(sourceCode)) !== null) {
            this.addTypeIfValid(match[1], types);
        }

        // Pattern 4: Type comparisons
        // e.g., "strategy_ == Strategy.NO_YIELD"
        const typeComparePattern = /==\s*([A-Z][a-zA-Z0-9_]*)\.|\b([A-Z][a-zA-Z0-9_]*)\.\w+\s*[=!<>]/g;
        while ((match = typeComparePattern.exec(sourceCode)) !== null) {
            this.addTypeIfValid(match[1] || match[2], types);
        }

        // Pattern 5: Generic type usage (any capitalized identifier)
        // This catches anything we might have missed
        const genericPattern = /\b([A-Z][a-zA-Z0-9_]*)\b/g;
        while ((match = genericPattern.exec(sourceCode)) !== null) {
            // Only add if it's likely a type (not a constant or function)
            const name = match[1];
            // Skip all-caps (likely constants) unless it looks like an interface
            if (name === name.toUpperCase() && !name.startsWith('I')) continue;
            this.addTypeIfValid(name, types);
        }
    }

    /**
     * Add a type to the set if it's valid (not a built-in, keyword, or interface)
     */
    private addTypeIfValid(name: string, types: Set<string>): void {
        if (!name) return;
        if (this.ELEMENTARY_TYPES.has(name.toLowerCase())) return;
        if (this.SKIP_NAMES.has(name)) return;
        if (name.length < 2) return;
        
        // Skip interface types (IERC20, IRewardPool, IAavePool, etc.)
        // They are external contracts and not useful in the diagram
        if (/^I[A-Z]/.test(name)) return;
        
        types.add(name);
    }

    /**
     * Resolve a type name to its definition
     */
    private resolveType(
        typeName: string,
        currentFile: ParsedFile,
        workspaceFiles: Map<string, ParsedFile>
    ): TypeReference | null {
        const parts = typeName.split('.');
        const localName = parts[parts.length - 1];
        const contractName = parts.length > 1 ? parts[0] : null;

        // First, search in the current file
        const localResult = this.findTypeInFile(localName, contractName, currentFile);
        if (localResult) {
            return localResult;
        }

        // Search in ALL workspace files
        for (const [filePath, parsedFile] of workspaceFiles) {
            if (filePath === currentFile.filePath) continue;

            const result = this.findTypeInFile(localName, contractName, parsedFile);
            if (result) {
                return result;
            }
        }

        // Return null if not found (no stub for types, unlike functions)
        return null;
    }

    /**
     * Find a type definition in a parsed file
     */
    private findTypeInFile(
        typeName: string,
        contractName: string | null,
        file: ParsedFile
    ): TypeReference | null {
        for (const contract of file.contracts) {
            // If contract name is specified, only search in that contract
            if (contractName && contract.name !== contractName) {
                continue;
            }

            // Search structs
            for (const struct of contract.structs) {
                if (struct.name === typeName) {
                    return {
                        name: contractName ? `${contractName}.${typeName}` : typeName,
                        kind: 'struct',
                        definition: struct
                    };
                }
            }

            // Search enums
            for (const enumDef of contract.enums) {
                if (enumDef.name === typeName) {
                    return {
                        name: contractName ? `${contractName}.${typeName}` : typeName,
                        kind: 'enum',
                        definition: enumDef
                    };
                }
            }
        }

        return null;
    }

    /**
     * Get the full source code for a struct
     */
    getStructSource(struct: StructInfo): string {
        return struct.fullSource;
    }

    /**
     * Get the full source code for an enum
     */
    getEnumSource(enumDef: EnumInfo): string {
        return enumDef.fullSource;
    }

    /**
     * Resolve a single type by name across all workspace files
     * Used for on-demand import from the webview
     */
    resolveSingleType(
        typeName: string,
        workspaceFiles: Map<string, ParsedFile>
    ): TypeReference | null {
        // Handle qualified names (Contract.TypeName)
        const parts = typeName.split('.');
        const localName = parts[parts.length - 1];
        const contractName = parts.length > 1 ? parts[0] : null;

        // Search in ALL workspace files
        for (const [filePath, parsedFile] of workspaceFiles) {
            const result = this.findTypeInFile(localName, contractName, parsedFile);
            if (result) {
                return result;
            }
        }

        return null;
    }

    /**
     * Check if a type exists in the workspace (quick check without full resolution)
     */
    typeExists(typeName: string, workspaceFiles: Map<string, ParsedFile>): boolean {
        return this.resolveSingleType(typeName, workspaceFiles) !== null;
    }
}
