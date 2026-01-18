/**
 * Represents a location in source code
 */
export interface SourceLocation {
    start: {
        line: number;
        column: number;
    };
    end: {
        line: number;
        column: number;
    };
}

/**
 * Represents a parsed Solidity function
 */
export interface FunctionInfo {
    name: string;
    visibility: string;
    stateMutability: string | null;
    parameters: ParameterInfo[];
    returnParameters: ParameterInfo[];
    modifiers: string[];
    body: string;
    fullSource: string;
    location: SourceLocation;
    filePath: string;
}

/**
 * Represents a function parameter
 */
export interface ParameterInfo {
    name: string;
    typeName: string;
    storageLocation: string | null;
}

/**
 * Represents a struct definition
 */
export interface StructInfo {
    name: string;
    members: StructMember[];
    fullSource: string;
    location: SourceLocation;
    filePath: string;
    contractName: string | null;
}

/**
 * Represents a struct member field
 */
export interface StructMember {
    name: string;
    typeName: string;
}

/**
 * Represents an enum definition
 */
export interface EnumInfo {
    name: string;
    members: string[];
    fullSource: string;
    location: SourceLocation;
    filePath: string;
    contractName: string | null;
}

/**
 * Represents a function call within a function body
 */
export interface FunctionCallInfo {
    name: string;
    expression: string;
    arguments: string[];
    location: SourceLocation;
    resolvedFunction: FunctionInfo | null;
}

/**
 * Represents the complete analysis of a function
 */
export interface FunctionAnalysis {
    function: FunctionInfo;
    referencedTypes: TypeReference[];
    innerCalls: FunctionCallInfo[];
}

/**
 * Represents a type reference (struct, enum, contract, etc.)
 */
export interface TypeReference {
    name: string;
    kind: 'struct' | 'enum' | 'contract' | 'interface' | 'library';
    definition: StructInfo | EnumInfo | null;
}

/**
 * Represents a parsed Solidity contract
 */
export interface ContractInfo {
    name: string;
    kind: 'contract' | 'interface' | 'library' | 'abstract';
    functions: FunctionInfo[];
    structs: StructInfo[];
    enums: EnumInfo[];
    stateVariables: StateVariableInfo[];
    location: SourceLocation;
    filePath: string;
}

/**
 * Represents a state variable
 */
export interface StateVariableInfo {
    name: string;
    typeName: string;
    visibility: string;
    fullSource: string;
    location: SourceLocation;
    filePath: string;
    contractName: string;
}

/**
 * Represents a complete parsed file
 */
export interface ParsedFile {
    filePath: string;
    contracts: ContractInfo[];
    imports: ImportInfo[];
    pragmas: string[];
}

/**
 * Represents an import statement
 */
export interface ImportInfo {
    path: string;
    absolutePath: string | null;
    symbols: string[];
}

/**
 * Configuration for diagram rendering
 */
export interface DiagramConfig {
    showLineNumbers: boolean;
    maxCodeLines: number;
    theme: 'dark' | 'light';
}

// ============ Webview Message Types ============

/**
 * Data for a code block to be displayed in the diagram
 */
export interface CodeBlockData {
    id: string;
    title: string;
    subtitle?: string;
    sourceCode: string;
    category: 'main' | 'struct' | 'enum' | 'function' | 'statevar';
    filePath: string;
    startLine: number;
    position: { x: number; y: number };
}

/**
 * Arrow definition for connecting blocks
 */
export interface ArrowData {
    id: string;
    sourceBlockId: string;
    sourceLine: number;
    targetBlockId: string;
    targetLine?: number;
    type: 'function' | 'struct' | 'enum' | 'statevar';
    label?: string;
}

/**
 * Request from webview to import a function/type definition
 */
export interface ImportRequest {
    command: 'importRequest';
    name: string;
    kind: 'function' | 'struct' | 'enum' | 'statevar';
    sourceBlockId: string;
    sourceLine: number;
}

/**
 * Response from extension with imported block data
 */
export interface ImportResponse {
    command: 'importResponse';
    success: boolean;
    requestId: string;
    block?: CodeBlockData;
    arrows?: ArrowData[];
    error?: string;
}

/**
 * Message from webview when a block is removed
 */
export interface BlockRemovedMessage {
    command: 'blockRemoved';
    blockId: string;
}

/**
 * Message from webview to go to source
 */
export interface GoToSourceMessage {
    command: 'goToSource';
    filePath: string;
    line: number;
}

/**
 * Union type for all webview messages
 */
export type WebviewMessage = 
    | ImportRequest 
    | BlockRemovedMessage 
    | GoToSourceMessage;
