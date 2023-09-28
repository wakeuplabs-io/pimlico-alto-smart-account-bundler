import { EntryPointAbi, HexData32, SubmittedUserOperation, UserOperation, UserOperationInfo } from "@alto/types"
import { Logger, Metrics, getNonceKeyAndValue } from "@alto/utils"
import { Address, PublicClient } from "viem"

export class MemoryStore {
    // private monitoredTransactions: Map<HexData32, TransactionInfo> = new Map() // tx hash to info
    private outstandingUserOperations: UserOperationInfo[] = []
    private avaiableOutstandingUserOperations: UserOperationInfo[] = []

    private processingUserOperations: UserOperationInfo[] = []
    private submittedUserOperations: SubmittedUserOperation[] = []

    private logger: Logger
    private metrics: Metrics

    constructor(logger: Logger, metrics: Metrics) {
        this.logger = logger
        this.metrics = metrics
    }

    outstandingIsEmpty(): boolean {
        return this.outstandingUserOperations.length === 0
    }

    addOutstanding(op: UserOperationInfo) {
        const store = this.outstandingUserOperations

        store.push(op)
        this.logger.debug({ userOpHash: op.userOperationHash, store: "outstanding" }, "added user op to mempool")
        this.metrics.userOperationsInMempool.metric
            .labels({
                status: "outstanding",
                chainId: this.metrics.userOperationsInMempool.chainId,
                network: this.metrics.userOperationsInMempool.network
            })
            .inc()
    }

    addProcessing(op: UserOperationInfo) {
        const store = this.processingUserOperations

        store.push(op)
        this.logger.debug({ userOpHash: op.userOperationHash, store: "processing" }, "added user op to mempool")
        this.metrics.userOperationsInMempool.metric
            .labels({
                status: "processing",
                chainId: this.metrics.userOperationsInMempool.chainId,
                network: this.metrics.userOperationsInMempool.network
            })
            .inc()
    }

    addSubmitted(op: SubmittedUserOperation) {
        const store = this.submittedUserOperations

        store.push(op)
        this.logger.debug(
            { userOpHash: op.userOperation.userOperationHash, store: "submitted" },
            "added user op to mempool"
        )
        this.metrics.userOperationsInMempool.metric
            .labels({
                status: "submitted",
                chainId: this.metrics.userOperationsInMempool.chainId,
                network: this.metrics.userOperationsInMempool.network
            })
            .inc()
    }

    removeOutstanding(userOpHash: HexData32) {
        const index = this.outstandingUserOperations.findIndex((op) => op.userOperationHash === userOpHash)
        if (index === -1) {
            this.logger.warn({ userOpHash, store: "outstanding" }, "tried to remove non-existent user op from mempool")
            return
        }

        this.outstandingUserOperations.splice(index, 1)
        this.logger.debug({ userOpHash, store: "outstanding" }, "removed user op from mempool")

        const availableIndex = this.avaiableOutstandingUserOperations.findIndex(
            (op) => op.userOperationHash === userOpHash
        )
        if (availableIndex === -1) {
            this.logger.warn(
                { userOpHash, store: "availableOutstanding" },
                "tried to remove non-existent user op from mempool"
            )
            return
        }

        this.avaiableOutstandingUserOperations.splice(availableIndex, 1)
        this.logger.debug({ userOpHash, store: "availableOutstanding" }, "removed user op from mempool")

        this.metrics.userOperationsInMempool.metric
            .labels({
                status: "outstanding",
                chainId: this.metrics.userOperationsInMempool.chainId,
                network: this.metrics.userOperationsInMempool.network
            })
            .dec()
    }

    removeProcessing(userOpHash: HexData32) {
        const index = this.processingUserOperations.findIndex((op) => op.userOperationHash === userOpHash)
        if (index === -1) {
            this.logger.warn({ userOpHash, store: "outstanding" }, "tried to remove non-existent user op from mempool")
            return
        }

        this.processingUserOperations.splice(index, 1)
        this.logger.debug({ userOpHash, store: "processing" }, "removed user op from mempool")
        this.metrics.userOperationsInMempool.metric
            .labels({
                status: "processing",
                chainId: this.metrics.userOperationsInMempool.chainId,
                network: this.metrics.userOperationsInMempool.network
            })
            .dec()
    }

    removeSubmitted(userOpHash: HexData32) {
        const index = this.submittedUserOperations.findIndex((op) => op.userOperation.userOperationHash === userOpHash)
        if (index === -1) {
            this.logger.warn({ userOpHash, store: "submitted" }, "tried to remove non-existent user op from mempool")
            return
        }

        this.submittedUserOperations.splice(index, 1)
        this.logger.debug({ userOpHash, store: "submitted" }, "removed user op from mempool")
        this.metrics.userOperationsInMempool.metric
            .labels({
                status: "submitted",
                chainId: this.metrics.userOperationsInMempool.chainId,
                network: this.metrics.userOperationsInMempool.network
            })
            .dec()
    }

    dumbAvailableOutstanding(): UserOperationInfo[] {
        this.logger.trace(
            { store: "availableOutstanding", length: this.avaiableOutstandingUserOperations.length },
            "dumping mempool"
        )
        return this.avaiableOutstandingUserOperations
    }

    dumpOutstanding(): UserOperationInfo[] {
        this.logger.trace({ store: "outstanding", length: this.outstandingUserOperations.length }, "dumping mempool")
        return this.outstandingUserOperations
    }

    dumpProcessing(): UserOperationInfo[] {
        this.logger.trace({ store: "processing", length: this.processingUserOperations.length }, "dumping mempool")
        return this.processingUserOperations
    }

    dumpSubmitted(): SubmittedUserOperation[] {
        this.logger.trace({ store: "submitted", length: this.submittedUserOperations.length }, "dumping mempool")
        return this.submittedUserOperations
    }

    clear(from: "outstanding" | "processing" | "submitted") {
        if (from === "outstanding") {
            this.outstandingUserOperations = []
            this.logger.debug({ store: from, length: this.outstandingUserOperations.length }, "clearing mempool")
        } else if (from === "processing") {
            this.processingUserOperations = []
            this.logger.debug({ store: from, length: this.processingUserOperations.length }, "clearing mempool")
        } else if (from === "submitted") {
            this.submittedUserOperations = []
            this.logger.debug({ store: from, length: this.submittedUserOperations.length }, "clearing mempool")
        } else {
            throw new Error("unreachable")
        }
    }

    async updateAvailableUserOperations(publicClient: PublicClient, entryPoint: Address) {
        const outstandingOps = this.dumpOutstanding().slice()

        function getSenderNonceKeyPair(op: UserOperation) {
            const [nonceKey, _] = getNonceKeyAndValue(op)

            return `${op.sender}_${nonceKey}`
        }

        function parseSenderNonceKeyPair(senderNonceKeyPair: string) {
            const [rawSender, rawNonceKey] = senderNonceKeyPair.split("_")

            const sender = rawSender as Address
            const nonceKey = BigInt(rawNonceKey)

            return { sender, nonceKey }
        }

        // get all unique senders and nonceKey pairs from outstanding, processing and submitted ops
        const allSendersAndNonceKeysRaw = new Set([
            ...outstandingOps.map((op) => getSenderNonceKeyPair(op.userOperation))
        ])

        const allSendersAndNonceKeys = [...allSendersAndNonceKeysRaw].map((senderNonceKeyPair) =>
            parseSenderNonceKeyPair(senderNonceKeyPair)
        )

        const results = await publicClient.multicall({
            contracts: allSendersAndNonceKeys.map((senderNonceKeyPair) => {
                return {
                    address: entryPoint,
                    abi: EntryPointAbi,
                    functionName: "getNonce",
                    args: [senderNonceKeyPair.sender, senderNonceKeyPair.nonceKey]
                }
            })
        })

        const availableOutstandingOps: UserOperationInfo[] = []

        for (let i = 0; i < allSendersAndNonceKeys.length; i++) {
            const senderAndNonceKey = allSendersAndNonceKeys[i]
            const sender = senderAndNonceKey.sender
            const nonceKey = senderAndNonceKey.nonceKey
            const result = results[i]

            if (result.status === "success") {
                const nonceValue = result.result

                outstandingOps.map((op) => {
                    const [outstandingOpNonceKey, outstandingOpNonceValue] = getNonceKeyAndValue(op.userOperation)

                    if (
                        op.userOperation.sender === sender &&
                        outstandingOpNonceKey === nonceKey &&
                        outstandingOpNonceValue === nonceValue
                    ) {
                        availableOutstandingOps.push(op)
                    }
                })
            } else {
                this.logger.error({ error: result.error }, "error fetching nonce")
            }
        }

        this.avaiableOutstandingUserOperations = availableOutstandingOps
    }
}
