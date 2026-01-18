import { SolidityParser } from '../parser/solidityParser';
import { ASTTraverser } from '../parser/astTraverser';
import {
    FunctionInfo,
    FunctionCallInfo,
    ParsedFile,
    SourceLocation
} from '../types';

export class CallGraphBuilder {
    private parser: SolidityParser;
    private traverser: ASTTraverser;

    // Built-in functions and keywords to skip
    private readonly BUILTINS = new Set([
        'require', 'assert', 'revert', 'keccak256', 'sha256', 'sha3',
        'ripemd160', 'ecrecover', 'addmod', 'mulmod', 'selfdestruct',
        'blockhash', 'gasleft', 'type', 'abi',
        'push', 'pop', 'transfer', 'send', 'call',
        'delegatecall', 'staticcall', 'encode', 'encodePacked',
        'encodeWithSelector', 'encodeWithSignature', 'decode',
        'length', 'balance', 'code', 'codehash',
        // SafeERC20 and common interface methods - skip these external calls
        'safeApprove', 'safeTransfer', 'safeTransferFrom', 'approve', 
        'transferFrom', 'allowance', 'balanceOf', 'totalSupply',
        'mint', 'burn', 'deposit', 'withdraw', 'borrow', 'repay',
        'supply', 'claim', 'stake', 'unstake'
    ]);

    // Elementary type names used for casting
    private readonly TYPE_CASTS = new Set([
        'address', 'bool', 'string', 'bytes',
        'uint', 'int', 'uint8', 'uint16', 'uint24', 'uint32', 'uint40', 'uint48', 
        'uint56', 'uint64', 'uint72', 'uint80', 'uint88', 'uint96', 'uint104', 
        'uint112', 'uint120', 'uint128', 'uint136', 'uint144', 'uint152', 'uint160',
        'uint168', 'uint176', 'uint184', 'uint192', 'uint200', 'uint208', 'uint216', 
        'uint224', 'uint232', 'uint240', 'uint248', 'uint256',
        'int8', 'int16', 'int24', 'int32', 'int40', 'int48', 'int56', 'int64',
        'int72', 'int80', 'int88', 'int96', 'int104', 'int112', 'int120', 'int128',
        'int136', 'int144', 'int152', 'int160', 'int168', 'int176', 'int184', 'int192',
        'int200', 'int208', 'int216', 'int224', 'int232', 'int240', 'int248', 'int256',
        'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
        'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 
        'bytes16', 'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 
        'bytes23', 'bytes24', 'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 
        'bytes30', 'bytes31', 'bytes32'
    ]);

    // Control flow keywords
    private readonly KEYWORDS = new Set([
        'if', 'else', 'for', 'while', 'do', 'return', 'emit', 'new', 'delete',
        'try', 'catch', 'break', 'continue'
    ]);

    constructor(parser: SolidityParser) {
        this.parser = parser;
        this.traverser = new ASTTraverser();
    }

    /**
     * Build a call graph for a function, identifying all inner function calls.
     * Only includes calls that can be resolved to actual function definitions.
     */
    async buildCallGraph(
        functionInfo: FunctionInfo,
        currentFile: ParsedFile,
        workspaceFiles: Map<string, ParsedFile>
    ): Promise<FunctionCallInfo[]> {
        const calls = this.extractFunctionCalls(functionInfo);
        const resolvedCalls: FunctionCallInfo[] = [];

        for (const call of calls) {
            // Skip if this is the main function itself (avoid self-reference)
            if (call.name === functionInfo.name) {
                continue;
            }
            
            const resolved = this.resolveFunctionCall(call, currentFile, workspaceFiles);
            // ONLY include calls that have a resolved function definition
            if (resolved.resolvedFunction) {
                resolvedCalls.push(resolved);
            }
        }

        return resolvedCalls;
    }

    /**
     * Extract all function calls from a function's source code
     */
    private extractFunctionCalls(functionInfo: FunctionInfo): FunctionCallInfo[] {
        const calls: FunctionCallInfo[] = [];
        const sourceCode = functionInfo.fullSource;

        const lines = sourceCode.split('\n');
        const seenCalls = new Set<string>();

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const lineNum = functionInfo.location.start.line + lineIdx;

            // Match direct function calls: functionName(
            const directCallPattern = /(?<![.\w])([a-z_][a-zA-Z0-9_]*)\s*\(/g;
            let match;
            
            while ((match = directCallPattern.exec(line)) !== null) {
                const name = match[1];
                const expression = name;

                // Skip if already seen
                const callKey = `${lineNum}:${expression}`;
                if (seenCalls.has(callKey)) continue;

                // Skip built-ins, keywords, and type casts
                if (this.shouldSkipCall(name, expression, line)) continue;

                seenCalls.add(callKey);
                calls.push({
                    name,
                    expression,
                    arguments: [],
                    location: {
                        start: { line: lineNum, column: match.index },
                        end: { line: lineNum, column: match.index + match[0].length }
                    },
                    resolvedFunction: null
                });
            }

            // Match method calls on 'this': this.method(
            const thisCallPattern = /this\.([a-z_][a-zA-Z0-9_]*)\s*\(/g;
            while ((match = thisCallPattern.exec(line)) !== null) {
                const name = match[1];
                const expression = `this.${name}`;

                const callKey = `${lineNum}:${expression}`;
                if (seenCalls.has(callKey)) continue;
                if (this.shouldSkipCall(name, expression, line)) continue;

                seenCalls.add(callKey);
                calls.push({
                    name,
                    expression,
                    arguments: [],
                    location: {
                        start: { line: lineNum, column: match.index },
                        end: { line: lineNum, column: match.index + match[0].length }
                    },
                    resolvedFunction: null
                });
            }

            // Match internal calls with underscore prefix (common pattern): _functionName(
            const internalCallPattern = /(?<![.\w])(_[a-zA-Z0-9_]+)\s*\(/g;
            while ((match = internalCallPattern.exec(line)) !== null) {
                const name = match[1];
                const expression = name;

                const callKey = `${lineNum}:${expression}`;
                if (seenCalls.has(callKey)) continue;
                if (this.shouldSkipCall(name, expression, line)) continue;

                seenCalls.add(callKey);
                calls.push({
                    name,
                    expression,
                    arguments: [],
                    location: {
                        start: { line: lineNum, column: match.index },
                        end: { line: lineNum, column: match.index + match[0].length }
                    },
                    resolvedFunction: null
                });
            }
        }

        return calls;
    }

    /**
     * Check if a call should be skipped
     */
    private shouldSkipCall(name: string, expression: string, line: string): boolean {
        // Skip built-ins
        if (this.BUILTINS.has(name)) return true;

        // Skip keywords
        if (this.KEYWORDS.has(name)) return true;

        // Skip type casts (address(0), uint256(value), etc.)
        if (this.TYPE_CASTS.has(name)) return true;

        // Skip interface calls: IERC20(addr).method()
        // These are external calls that can't be resolved
        if (this.isInterfaceCall(name, line)) return true;

        // Skip if it's a method call on an interface cast
        // e.g., IERC20(token_).safeApprove(...)
        const interfaceMethodPattern = new RegExp(`I[A-Z][a-zA-Z0-9_]*\\([^)]*\\)\\.${name}\\s*\\(`);
        if (interfaceMethodPattern.test(line)) return true;

        // Skip external contract calls: contractVar.method()
        // We only want internal/local function calls
        const externalCallPattern = new RegExp(`\\w+\\.${name}\\s*\\(`);
        if (externalCallPattern.test(line) && !line.includes(`this.${name}`)) {
            // Check if it's a variable.method pattern (external call)
            const varMethodPattern = new RegExp(`([a-z_][a-zA-Z0-9_]*)\\.${name}\\s*\\(`);
            if (varMethodPattern.test(line)) return true;
        }

        return false;
    }

    /**
     * Check if this is an interface type cast call
     */
    private isInterfaceCall(name: string, line: string): boolean {
        // Interface names typically start with 'I' followed by uppercase
        // e.g., IERC20, IRewardPool, IAavePool
        if (/^I[A-Z]/.test(name)) {
            // Check if it's used as a type cast: IERC20(addr)
            const typeCastPattern = new RegExp(`${name}\\s*\\([^)]+\\)`);
            if (typeCastPattern.test(line)) return true;
        }
        return false;
    }

    /**
     * Resolve a function call to its definition
     */
    private resolveFunctionCall(
        call: FunctionCallInfo,
        currentFile: ParsedFile,
        workspaceFiles: Map<string, ParsedFile>
    ): FunctionCallInfo {
        const resolvedFunction = this.findFunctionDefinition(
            call.name,
            call.expression,
            currentFile,
            workspaceFiles
        );

        return {
            ...call,
            resolvedFunction
        };
    }

    /**
     * Find a function definition by name
     */
    private findFunctionDefinition(
        name: string,
        expression: string,
        currentFile: ParsedFile,
        workspaceFiles: Map<string, ParsedFile>
    ): FunctionInfo | null {
        const parts = expression.split('.');
        const functionName = parts[parts.length - 1];

        // Search in current file first
        for (const contract of currentFile.contracts) {
            for (const func of contract.functions) {
                if (func.name === functionName) {
                    return func;
                }
            }
        }

        // Search in workspace files (for inherited/imported functions)
        for (const [filePath, parsedFile] of workspaceFiles) {
            if (filePath === currentFile.filePath) continue;

            for (const contract of parsedFile.contracts) {
                for (const func of contract.functions) {
                    if (func.name === functionName) {
                        return func;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Get the depth of function calls
     */
    getCallDepth(calls: FunctionCallInfo[]): number {
        let maxDepth = 0;
        for (const call of calls) {
            if (call.resolvedFunction) {
                maxDepth = Math.max(maxDepth, 1);
            }
        }
        return maxDepth;
    }

    /**
     * Resolve a single function by name across all workspace files
     * Used for on-demand import from the webview
     */
    resolveSingleFunction(
        functionName: string,
        workspaceFiles: Map<string, ParsedFile>
    ): FunctionInfo | null {
        // Handle qualified names (this.functionName or Contract.functionName)
        const parts = functionName.split('.');
        const localName = parts[parts.length - 1];

        // Search in all workspace files
        for (const [filePath, parsedFile] of workspaceFiles) {
            for (const contract of parsedFile.contracts) {
                for (const func of contract.functions) {
                    if (func.name === localName) {
                        return func;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Check if a function exists in the workspace (quick check)
     */
    functionExists(functionName: string, workspaceFiles: Map<string, ParsedFile>): boolean {
        return this.resolveSingleFunction(functionName, workspaceFiles) !== null;
    }
}
