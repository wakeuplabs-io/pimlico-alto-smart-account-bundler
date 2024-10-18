import {
    Counter,
    Gauge,
    Histogram,
    type Registry,
    collectDefaultMetrics
} from "prom-client"

export type Metrics = ReturnType<typeof createMetrics>

export function createMetrics(registry: Registry, register = true) {
    collectDefaultMetrics({ register: registry })

    const registers = register ? [registry] : []

    const httpRequests = new Counter({
        name: "alto_requests_total",
        help: "Total number of requests",
        labelNames: [
            "route",
            "network",
            "chainId",
            "rpc_method",
            "rpc_status",
            "code",
            "method"
        ] as const,
        registers
    })

    const httpRequestsDuration = new Histogram({
        name: "alto_requests_duration_seconds",
        help: "Duration of requests in seconds",
        labelNames: [
            "route",
            "network",
            "chainId",
            "rpc_method",
            "rpc_status",
            "code",
            "method",
            "api_version"
        ] as const,
        registers
    })

    const userOperationsInMempool = new Gauge({
        name: "alto_user_operations_in_mempool_count",
        help: "Number of user operations in mempool",
        labelNames: ["network", "chainId", "status"] as const,
        registers
    })

    const walletsAvailable = new Gauge({
        name: "alto_executor_wallets_available_count",
        help: "Number of available executor wallets used to bundle",
        labelNames: [] as const,
        registers
    })

    const walletsTotal = new Gauge({
        name: "alto_executor_wallets_total_count",
        help: "Number of total executor wallets used to bundle",
        labelNames: [] as const,
        registers
    })

    const userOperationsOnChain = new Counter({
        name: "alto_user_operations_on_chain_total",
        help: "Number of user operations on-chain by status",
        labelNames: ["status"] as const,
        registers
    })

    const userOperationsSubmitted = new Counter({
        name: "alto_user_operations_submitted_total",
        help: "Number of user operations bundles submitted on-chain",
        labelNames: ["status"] as const,
        registers
    })

    const bundlesIncluded = new Counter({
        name: "alto_bundles_included_total",
        help: "Number of user operations bundles included on-chain",
        labelNames: [] as const,
        registers
    })

    const bundlesReplaced = new Counter({
        name: "alto_bundles_replaced_total",
        help: "Number of user operation bundles replaced",
        labelNames: ["status"] as const,
        registers
    })

    const bundlesSubmitted = new Counter({
        name: "alto_bundles_submitted_total",
        help: "Number of user operations bundles submitted on-chain",
        labelNames: ["status"] as const,
        registers
    })

    const userOperationsReceived = new Counter({
        name: "alto_user_operations_received_total",
        help: "Number of user operations received",
        labelNames: ["status", "type"] as const,
        registers
    })

    const userOperationsValidationSuccess = new Counter({
        name: "alto_user_operations_validation_success_total",
        help: "Number of user operations successfully validated",
        labelNames: [] as const,
        registers
    })

    const userOperationsValidationFailure = new Counter({
        name: "alto_user_operations_validation_failure_total",
        help: "Number of user operations failed to validate",
        labelNames: [] as const,
        registers
    })

    const userOperationInclusionDuration = new Histogram({
        name: "alto_user_operation_inclusion_duration_seconds",
        help: "Duration of user operation inclusion from first submission to inclusion on-chain",
        labelNames: [] as const,
        registers,
        buckets: [
            0.5, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 120,
            180, 240, 300, 600, 900, 1200
        ]
    })

    const verificationGasLimitEstimationTime = new Histogram({
        name: "alto_verification_gas_limit_estimation_time_seconds",
        help: "Total duration of verification gas limit estimation",
        labelNames: [] as const,
        registers,
        buckets: [0.1, 0.2, 0.3, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5]
    })

    const verificationGasLimitEstimationCount = new Histogram({
        name: "alto_verification_gas_limit_estimation_count",
        help: "Number of verification gas limit estimation calls",
        labelNames: [] as const,
        registers,
        buckets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    })

    const replacedTransactions = new Counter({
        name: "alto_replaced_transactions_total",
        help: "Number of replaced transactions",
        labelNames: ["reason", "status"] as const,
        registers
    })

    const userOperationsReplaced = new Counter({
        name: "alto_user_operations_replaced_total",
        help: "Number of user operations replaced",
        labelNames: [] as const,
        registers
    })

    const userOperationsResubmitted = new Counter({
        name: "alto_user_operations_resubmitted_total",
        help: "Number of user operations resubmitted",
        labelNames: [] as const,
        registers
    })

    const utilityWalletBalance = new Gauge({
        name: "alto_utility_wallet_balance",
        help: "Balance of the utility wallet",
        labelNames: [] as const,
        registers
    })

    const executorWalletsBalances = new Gauge({
        name: "alto_executor_wallet_balance",
        help: "Balance of the executor wallet",
        labelNames: ["wallet"] as const,
        registers
    })

    const executorWalletsMinBalance = new Gauge({
        name: "alto_executor_wallets_min_balance",
        help: "Minimum balance of the executor wallets",
        labelNames: [] as const,
        registers
    })

    const emittedOpEvents = new Counter({
        name: "alto_emitted_user_operation_events",
        help: "Total number of emitted UserOperation status events",
        labelNames: ["event_type", "status"] as const,
        registers
    })

    return {
        httpRequests,
        httpRequestsDuration,
        userOperationsInMempool,
        walletsAvailable,
        walletsTotal,
        userOperationsOnChain,
        userOperationsSubmitted,
        bundlesIncluded,
        bundlesSubmitted,
        bundlesReplaced,
        userOperationsReceived,
        userOperationsValidationSuccess,
        userOperationsValidationFailure,
        userOperationInclusionDuration,
        verificationGasLimitEstimationTime,
        verificationGasLimitEstimationCount,
        replacedTransactions,
        userOperationsResubmitted,
        userOperationsReplaced,
        utilityWalletBalance,
        executorWalletsBalances,
        executorWalletsMinBalance,
        emittedOpEvents
    }
}
