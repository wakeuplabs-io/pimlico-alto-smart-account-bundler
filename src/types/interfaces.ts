import type { Address } from "viem"
import type { SimulateHandleOpResult } from "../rpc/gasEstimation"
import type { ReferencedCodeHashes } from "./mempool"
import type {
    StateOverrides,
    UserOperation,
    UserOperationV06,
    UserOperationV07
} from "./schemas"
import type * as validation from "./validation"
import { ApiVersion } from "./utils"

export interface InterfaceValidator {
    getExecutionResult(
        userOperation: UserOperation,
        entryPoint: Address,
        stateOverrides?: StateOverrides
    ): Promise<SimulateHandleOpResult<"execution">>
    getValidationResultV06(
        userOperation: UserOperationV06,
        entryPoint: Address,
        _codeHashes?: ReferencedCodeHashes
    ): Promise<
        (
            | validation.ValidationResult
            | validation.ValidationResultWithAggregation
        ) & {
            storageMap: validation.StorageMap
            referencedContracts?: ReferencedCodeHashes
        }
    >
    getValidationResultV07(
        userOperation: UserOperationV07,
        entryPoint: Address,
        _codeHashes?: ReferencedCodeHashes
    ): Promise<
        (
            | validation.ValidationResult
            | validation.ValidationResultWithAggregation
        ) & {
            storageMap: validation.StorageMap
            referencedContracts?: ReferencedCodeHashes
        }
    >
    getValidationResult(
        userOperation: UserOperation,
        entryPoint: Address,
        _codeHashes?: ReferencedCodeHashes
    ): Promise<
        (
            | validation.ValidationResult
            | validation.ValidationResultWithAggregation
        ) & {
            storageMap: validation.StorageMap
            referencedContracts?: ReferencedCodeHashes
        }
    >
    validatePreVerificationGas(
        apiVersion: ApiVersion,
        userOperation: UserOperation,
        entryPoint: Address
    ): Promise<void>
    validateUserOperation(
        apiVersion: ApiVersion,
        userOperation: UserOperation,
        entryPoint: Address,
        referencedContracts?: ReferencedCodeHashes
    ): Promise<
        (
            | validation.ValidationResult
            | validation.ValidationResultWithAggregation
        ) & {
            storageMap: validation.StorageMap
            referencedContracts?: ReferencedCodeHashes
        }
    >
}
