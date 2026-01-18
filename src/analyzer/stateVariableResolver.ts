import { SolidityParser } from '../parser/solidityParser';
import {
    FunctionInfo,
    StateVariableInfo,
    ParsedFile,
    ContractInfo
} from '../types';

/**
 * Resolves state variable references to their declarations
 */
export class StateVariableResolver {
    private parser: SolidityParser;

    constructor(parser: SolidityParser) {
        this.parser = parser;
    }

    /**
     * Extract all state variable names that are referenced in a function's source code.
     * This identifies which identifiers in the function body are state variables.
     */
    extractStateVariableReferences(
        functionInfo: FunctionInfo,
        currentContract: ContractInfo
    ): Set<string> {
        const stateVarNames = new Set<string>();
        const source = functionInfo.fullSource;
        
        // Get all state variable names from the contract
        const contractStateVars = new Set(
            currentContract.stateVariables.map(sv => sv.name)
        );
        
        // Find all identifiers in the function source that match state variable names
        // Pattern: word boundary + identifier + word boundary
        const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        let match;
        
        while ((match = identifierPattern.exec(source)) !== null) {
            const identifier = match[1];
            if (contractStateVars.has(identifier)) {
                stateVarNames.add(identifier);
            }
        }
        
        return stateVarNames;
    }

    /**
     * Resolve a state variable by name within a specific contract or across workspace files.
     * First checks the current contract, then searches other contracts in the workspace.
     */
    resolveStateVariable(
        name: string,
        currentContractName: string | null,
        workspaceFiles: Map<string, ParsedFile>
    ): StateVariableInfo | null {
        // First, try to find in the current contract (if specified)
        if (currentContractName) {
            for (const [, parsedFile] of workspaceFiles) {
                for (const contract of parsedFile.contracts) {
                    if (contract.name === currentContractName) {
                        const stateVar = contract.stateVariables.find(
                            sv => sv.name === name
                        );
                        if (stateVar) {
                            return stateVar;
                        }
                    }
                }
            }
        }

        // Search across all contracts in all files
        for (const [, parsedFile] of workspaceFiles) {
            for (const contract of parsedFile.contracts) {
                const stateVar = contract.stateVariables.find(
                    sv => sv.name === name
                );
                if (stateVar) {
                    return stateVar;
                }
            }
        }

        return null;
    }

    /**
     * Get all state variables from a specific contract
     */
    getContractStateVariables(
        contractName: string,
        workspaceFiles: Map<string, ParsedFile>
    ): StateVariableInfo[] {
        for (const [, parsedFile] of workspaceFiles) {
            for (const contract of parsedFile.contracts) {
                if (contract.name === contractName) {
                    return contract.stateVariables;
                }
            }
        }
        return [];
    }

    /**
     * Check if a state variable exists in the workspace
     */
    stateVariableExists(
        name: string,
        workspaceFiles: Map<string, ParsedFile>
    ): boolean {
        return this.resolveStateVariable(name, null, workspaceFiles) !== null;
    }

    /**
     * Find the contract that contains a given function
     */
    findContractForFunction(
        functionInfo: FunctionInfo,
        workspaceFiles: Map<string, ParsedFile>
    ): ContractInfo | null {
        for (const [, parsedFile] of workspaceFiles) {
            for (const contract of parsedFile.contracts) {
                const found = contract.functions.find(
                    f => f.name === functionInfo.name && 
                         f.filePath === functionInfo.filePath &&
                         f.location.start.line === functionInfo.location.start.line
                );
                if (found) {
                    return contract;
                }
            }
        }
        return null;
    }
}
