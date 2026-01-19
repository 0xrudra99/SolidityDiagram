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
    baseContracts: string[];  // Names of inherited contracts/interfaces (is X, Y, Z)
    functions: FunctionInfo[];
    structs: StructInfo[];
    enums: EnumInfo[];
    stateVariables: StateVariableInfo[];
    location: SourceLocation;
    filePath: string;
}

/**
 * Represents a resolved implementation of an interface method
 */
export interface ImplementationInfo {
    contractName: string;
    contractKind: 'contract' | 'interface' | 'library' | 'abstract';
    functionInfo: FunctionInfo;
    filePath: string;
    /** Whether this is a direct implementation or inherited */
    isInherited: boolean;
    /** The inheritance chain (e.g., ["MyToken", "ERC20", "IERC20"]) */
    inheritanceChain: string[];
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
    kind: 'function' | 'struct' | 'enum' | 'statevar' | 'implementation';
    sourceBlockId: string;
    sourceLine: number;
    /** For implementation requests: the interface name (e.g., "IERC20") */
    interfaceName?: string;
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

// ============ Data Flow Analysis Types ============

/**
 * Represents a node in the data flow graph (a variable at a specific location)
 */
export interface DataFlowNode {
    /** The variable/identifier name */
    varName: string;
    /** What kind of variable this is */
    kind: 'parameter' | 'local' | 'state' | 'return' | 'msg' | 'block' | 'tx';
    /** Line number in the source file */
    line: number;
    /** Column number in the source file */
    column: number;
    /** Whether this is a definition (vs a use) */
    isDefinition: boolean;
    /** The type of the variable if known */
    typeName?: string;
    /** DeFi-specific tag for special values */
    defiTag?: 'token-amount' | 'address-target' | 'msg-value' | 'msg-sender' | 'balance';
}

/**
 * Represents an edge in the data flow graph (data flowing from one node to another)
 */
export interface DataFlowEdge {
    /** Source node (where data comes from) */
    from: DataFlowNode;
    /** Target node (where data goes to) */
    to: DataFlowNode;
    /** Type of edge */
    edgeType: 'assign' | 'use' | 'call-arg' | 'return' | 'state-write' | 'state-read' | 'external-call';
    /** Description of any transformation applied (e.g., "* price / 1e18") */
    transformation?: string;
}

/**
 * Represents a sink - where data ultimately flows to (external calls, state writes, returns)
 */
export interface SinkInfo {
    /** Type of sink */
    kind: 'external-call' | 'state-write' | 'return' | 'event-emit';
    /** Line number */
    line: number;
    /** Column number */
    column: number;
    /** Description of the sink (e.g., "token.transfer(to, amount)") */
    description: string;
    /** Variables that flow into this sink */
    inputVars: string[];
    /** The target of an external call (if applicable) */
    callTarget?: string;
}

/**
 * Complete data flow graph for a function
 */
export interface DataFlowGraph {
    /** All nodes (variable definitions and uses) */
    nodes: DataFlowNode[];
    /** All edges (data flowing between nodes) */
    edges: DataFlowEdge[];
    /** All sinks (where data ultimately goes) */
    sinks: SinkInfo[];
    /** Map of variable name to all its definitions */
    definitions: Map<string, DataFlowNode[]>;
    /** Map of variable name to all its uses */
    uses: Map<string, DataFlowNode[]>;
}

/**
 * Serializable version of DataFlowGraph for passing to webview
 */
export interface DataFlowGraphData {
    nodes: DataFlowNode[];
    edges: DataFlowEdge[];
    sinks: SinkInfo[];
    /** definitions as array of [varName, nodes[]] */
    definitions: [string, DataFlowNode[]][];
    /** uses as array of [varName, nodes[]] */
    uses: [string, DataFlowNode[]][];
}

/**
 * Extended function analysis including data flow
 */
export interface FunctionAnalysisWithFlow extends FunctionAnalysis {
    /** Data flow graph for the function */
    dataFlow: DataFlowGraph;
}
