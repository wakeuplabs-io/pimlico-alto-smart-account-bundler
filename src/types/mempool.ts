import type { Address, Chain, Hex } from "viem"
import type { Account } from "viem/accounts"
import type { CompressedUserOperation, HexData32, UserOperation } from "."

export interface ReferencedCodeHashes {
    // addresses accessed during this user operation
    addresses: string[]

    // keccak over the code of all referenced addresses
    hash: string
}

export const deriveUserOperation = (
    op: MempoolUserOperation
): UserOperation => {
    return isCompressedType(op)
        ? (op as CompressedUserOperation).inflatedOp
        : (op as UserOperation)
}

export const isCompressedType = (op: MempoolUserOperation): boolean => {
    return "compressedCalldata" in op
}

export type MempoolUserOperation = UserOperation | CompressedUserOperation

export type TransactionInfo = {
    transactionType: "default" | "compressed"
    transactionHash: HexData32
    previousTransactionHashes: HexData32[]
    entryPoint: Address
    isVersion06: boolean
    transactionRequest: {
        account: Account
        to: Address
        data: Hex
        gas: bigint
        chain: Chain
        maxFeePerGas: bigint
        maxPriorityFeePerGas: bigint
        nonce: number
    }
    executor: Account
    userOperationInfos: UserOperationInfo[]
    lastReplaced: number
    firstSubmitted: number
    timesPotentiallyIncluded: number
}

export type UserOperationInfo = {
    mempoolUserOperation: MempoolUserOperation
    entryPoint: Address
    userOperationHash: HexData32
    lastReplaced: number
    firstSubmitted: number
    referencedContracts?: ReferencedCodeHashes
}

export enum SubmissionStatus {
    NotSubmitted = "not_submitted",
    Rejected = "rejected",
    Submitted = "submitted",
    Included = "included"
}

export type SubmittedUserOperation = {
    userOperation: UserOperationInfo
    transactionInfo: TransactionInfo
}

type Result<T, E, R, F> = Success<T> | Failure<E> | Resubmit<R> | Replace<F>

interface Success<T> {
    status: "success"
    value: T
}

interface Failure<E> {
    status: "failure"
    error: E
}

interface Resubmit<R> {
    status: "resubmit"
    info: R
}

interface Replace<R> {
    status: "replace"
    info: R
}

export type BundleResult = Result<
    {
        userOperation: UserOperationInfo
        transactionInfo: TransactionInfo
    },
    {
        reason: string
        userOpHash: HexData32
        entryPoint: Address
        userOperation: MempoolUserOperation
    },
    {
        reason: string
        userOpHash: HexData32
        entryPoint: Address
        userOperation: MempoolUserOperation
    },
    {
        reason: string
        userOpHash: HexData32
        entryPoint: Address
        userOperation: MempoolUserOperation
    }
>
