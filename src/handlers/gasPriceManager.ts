import {
    type GasPriceParameters,
    RpcError,
    gasStationResult
} from "@alto/types"
import { type Logger, maxBigInt, minBigInt } from "@alto/utils"
import * as sentry from "@sentry/node"
import { maxUint128, parseGwei } from "viem"
import {
    avalanche,
    celo,
    celoAlfajores,
    dfk,
    polygon,
    polygonMumbai
} from "viem/chains"
import type { AltoConfig } from "../createConfig"

enum ChainId {
    Goerli = 5,
    Polygon = 137,
    Mumbai = 80001,
    LineaTestnet = 59140,
    Linea = 59144
}

const MIN_POLYGON_GAS_PRICE = parseGwei("31")
const MIN_MUMBAI_GAS_PRICE = parseGwei("1")

function getGasStationUrl(chainId: ChainId.Polygon | ChainId.Mumbai): string {
    switch (chainId) {
        case ChainId.Polygon:
            return "https://gasstation.polygon.technology/v2"
        case ChainId.Mumbai:
            return "https://gasstation-testnet.polygon.technology/v2"
    }
}

export type ArbitrumManager = {
    saveL1BaseFee: (baseFee: bigint) => void
    saveL2BaseFee: (baseFee: bigint) => void
    getMinL1BaseFee: () => bigint
    getMaxL1BaseFee: () => bigint
    getMaxL2BaseFee: () => bigint
}

const createArbitrumManager = (maxQueueSize: number): ArbitrumManager => {
    const queueL1BaseFee: { timestamp: number; baseFee: bigint }[] = []
    const queueL2BaseFee: { timestamp: number; baseFee: bigint }[] = []
    const queueValidity = 15_000

    return {
        saveL1BaseFee(baseFee: bigint) {
            if (baseFee === 0n) {
                return
            }

            const last =
                queueL1BaseFee.length > 0
                    ? queueL1BaseFee[queueL1BaseFee.length - 1]
                    : null
            const timestamp = Date.now()

            if (!last || timestamp - last.timestamp >= queueValidity) {
                if (queueL1BaseFee.length >= maxQueueSize) {
                    queueL1BaseFee.shift()
                }
                queueL1BaseFee.push({ baseFee, timestamp })
            } else if (baseFee < last.baseFee) {
                last.baseFee = baseFee
                last.timestamp = timestamp
            }
        },
        saveL2BaseFee(baseFee: bigint) {
            if (baseFee === 0n) {
                return
            }

            const last =
                queueL2BaseFee.length > 0
                    ? queueL2BaseFee[queueL2BaseFee.length - 1]
                    : null
            const timestamp = Date.now()

            if (!last || timestamp - last.timestamp >= queueValidity) {
                if (queueL2BaseFee.length >= maxQueueSize) {
                    queueL2BaseFee.shift()
                }
                queueL2BaseFee.push({ baseFee, timestamp })
            } else if (baseFee < last.baseFee) {
                last.baseFee = baseFee
                last.timestamp = timestamp
            }
        },
        getMinL1BaseFee() {
            if (queueL1BaseFee.length === 0) {
                return 1n
            }
            return queueL1BaseFee.reduce(
                (acc: bigint, cur) => minBigInt(cur.baseFee, acc),
                queueL1BaseFee[0].baseFee
            )
        },
        getMaxL1BaseFee() {
            if (queueL1BaseFee.length === 0) {
                return maxUint128
            }

            return queueL1BaseFee.reduce(
                (acc: bigint, cur) => maxBigInt(cur.baseFee, acc),
                queueL1BaseFee[0].baseFee
            )
        },
        getMaxL2BaseFee() {
            if (queueL2BaseFee.length === 0) {
                return maxUint128
            }

            return queueL2BaseFee.reduce(
                (acc: bigint, cur) => maxBigInt(cur.baseFee, acc),
                queueL2BaseFee[0].baseFee
            )
        }
    }
}

const getPolygonGasPriceParameters = async (
    config: AltoConfig,
    {
        logger
    }: {
        logger: Logger
    }
): Promise<GasPriceParameters | null> => {
    const gasStationUrl = getGasStationUrl(config.publicClient.chain.id)
    try {
        const data = await (await fetch(gasStationUrl)).json()
        // take the standard speed here, SDK options will define the extra tip
        const parsedData = gasStationResult.parse(data)

        return parsedData.fast
    } catch (e) {
        logger.error(
            { error: e },
            "failed to fetch gasPrices from gas station, using default"
        )
        return null
    }
}

const getDefaultGasFee = (config: AltoConfig): bigint => {
    switch (config.publicClient.chain.id) {
        case ChainId.Polygon:
            return MIN_POLYGON_GAS_PRICE
        case ChainId.Mumbai:
            return MIN_MUMBAI_GAS_PRICE
        default:
            return 0n
    }
}

const bumpTheGasPrice = (
    config: AltoConfig,
    {
        gasPrice
    }: {
        gasPrice: GasPriceParameters
    }
): GasPriceParameters => {
    const bumpAmount = config.gasPriceBump

    const maxPriorityFeePerGas = maxBigInt(
        gasPrice.maxPriorityFeePerGas,
        getDefaultGasFee(config)
    )
    const maxFeePerGas = maxBigInt(gasPrice.maxFeePerGas, maxPriorityFeePerGas)

    const result = {
        maxFeePerGas: (maxFeePerGas * bumpAmount) / 100n,
        maxPriorityFeePerGas: (maxPriorityFeePerGas * bumpAmount) / 100n
    }

    if (
        config.publicClient.chain.id === celo.id ||
        config.publicClient.chain.id === celoAlfajores.id
    ) {
        const maxFee = maxBigInt(
            result.maxFeePerGas,
            result.maxPriorityFeePerGas
        )
        return {
            maxFeePerGas: maxFee,
            maxPriorityFeePerGas: maxFee
        }
    }

    if (config.publicClient.chain.id === dfk.id) {
        const maxFeePerGas = maxBigInt(5_000_000_000n, result.maxFeePerGas)
        const maxPriorityFeePerGas = maxBigInt(
            5_000_000_000n,
            result.maxPriorityFeePerGas
        )

        return {
            maxFeePerGas,
            maxPriorityFeePerGas
        }
    }

    // set a minimum maxPriorityFeePerGas & maxFeePerGas to 1.5gwei on avalanche (because eth_maxPriorityFeePerGas returns 0)
    if (config.publicClient.chain.id === avalanche.id) {
        const maxFeePerGas = maxBigInt(parseGwei("1.5"), result.maxFeePerGas)
        const maxPriorityFeePerGas = maxBigInt(
            parseGwei("1.5"),
            result.maxPriorityFeePerGas
        )

        return {
            maxFeePerGas,
            maxPriorityFeePerGas
        }
    }

    return result
}

const getLegacyTransactionGasPrice = async (
    config: AltoConfig,
    {
        logger
    }: {
        logger: Logger
    }
): Promise<GasPriceParameters> => {
    let gasPrice: bigint | undefined
    try {
        const gasInfo = await config.publicClient.estimateFeesPerGas({
            chain: config.publicClient.chain,
            type: "legacy"
        })
        gasPrice = gasInfo.gasPrice
    } catch (e) {
        sentry.captureException(e)
        logger.error(
            "failed to fetch legacy gasPrices from estimateFeesPerGas",
            { error: e }
        )
        gasPrice = undefined
    }

    if (gasPrice === undefined) {
        logger.warn("gasPrice is undefined, using fallback value")
        try {
            gasPrice = await config.publicClient.getGasPrice()
        } catch (e) {
            logger.error("failed to get fallback gasPrice")
            sentry.captureException(e)
            throw e
        }
    }

    return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice
    }
}

const getFallBackMaxPriorityFeePerGas = async (
    config: AltoConfig,
    { gasPrice }: { gasPrice: bigint }
): Promise<bigint> => {
    const feeHistory = await config.publicClient.getFeeHistory({
        blockCount: 10,
        rewardPercentiles: [20],
        blockTag: "latest"
    })

    if (feeHistory.reward === undefined || feeHistory.reward === null) {
        return gasPrice
    }

    const feeAverage =
        feeHistory.reward.reduce((acc, cur) => cur[0] + acc, 0n) / 10n
    return minBigInt(feeAverage, gasPrice)
}

const getNextBaseFee = async (config: AltoConfig) => {
    const block = await config.publicClient.getBlock({
        blockTag: "latest"
    })
    const currentBaseFeePerGas =
        block.baseFeePerGas || (await config.publicClient.getGasPrice())
    const currentGasUsed = block.gasUsed
    const gasTarget = block.gasLimit / 2n

    if (currentGasUsed === gasTarget) {
        return currentBaseFeePerGas
    }

    if (currentGasUsed > gasTarget) {
        const gasUsedDelta = currentGasUsed - gasTarget
        const baseFeePerGasDelta = maxBigInt(
            (currentBaseFeePerGas * gasUsedDelta) / gasTarget / 8n,
            1n
        )
        return currentBaseFeePerGas + baseFeePerGasDelta
    }

    const gasUsedDelta = currentGasUsed - gasTarget
    const baseFeePerGasDelta =
        (currentBaseFeePerGas * gasUsedDelta) / gasTarget / 8n
    return currentBaseFeePerGas - baseFeePerGasDelta
}

const estimateGasPrice = async (
    config: AltoConfig,
    {
        logger
    }: {
        logger: Logger
    }
): Promise<GasPriceParameters> => {
    let maxFeePerGas: bigint | undefined
    let maxPriorityFeePerGas: bigint | undefined

    try {
        const fees = await config.publicClient.estimateFeesPerGas({
            chain: config.publicClient.chain
        })
        maxFeePerGas = fees.maxFeePerGas
        maxPriorityFeePerGas = fees.maxPriorityFeePerGas
    } catch (e) {
        sentry.captureException(e)
        logger.error(
            "failed to fetch eip-1559 gasPrices from estimateFeesPerGas",
            { error: e }
        )
        maxFeePerGas = undefined
        maxPriorityFeePerGas = undefined
    }

    if (maxPriorityFeePerGas === undefined) {
        logger.warn("maxPriorityFeePerGas is undefined, using fallback value")
        try {
            maxPriorityFeePerGas = await getFallBackMaxPriorityFeePerGas(
                config,
                {
                    gasPrice: maxFeePerGas ?? 0n
                }
            )
        } catch (e) {
            logger.error("failed to get fallback maxPriorityFeePerGas")
            sentry.captureException(e)
            throw e
        }
    }

    if (maxFeePerGas === undefined) {
        logger.warn("maxFeePerGas is undefined, using fallback value")
        try {
            maxFeePerGas = (await getNextBaseFee(config)) + maxPriorityFeePerGas
        } catch (e) {
            logger.error("failed to get fallback maxFeePerGas")
            sentry.captureException(e)
            throw e
        }
    }

    if (maxPriorityFeePerGas === 0n) {
        maxPriorityFeePerGas = maxFeePerGas / 200n
    }

    return { maxFeePerGas, maxPriorityFeePerGas }
}

const innerGetGasPrice = async (
    config: AltoConfig,
    {
        logger
    }: {
        logger: Logger
    }
): Promise<GasPriceParameters> => {
    let maxFeePerGas = 0n
    let maxPriorityFeePerGas = 0n

    if (
        config.publicClient.chain.id === polygon.id ||
        config.publicClient.chain.id === polygonMumbai.id
    ) {
        const polygonEstimate = await getPolygonGasPriceParameters(config, {
            logger
        })
        if (polygonEstimate) {
            const gasPrice = bumpTheGasPrice(config, {
                gasPrice: {
                    maxFeePerGas: polygonEstimate.maxFeePerGas,
                    maxPriorityFeePerGas: polygonEstimate.maxPriorityFeePerGas
                }
            })

            return {
                maxFeePerGas: maxBigInt(gasPrice.maxFeePerGas, maxFeePerGas),
                maxPriorityFeePerGas: maxBigInt(
                    gasPrice.maxPriorityFeePerGas,
                    maxPriorityFeePerGas
                )
            }
        }
    }

    if (config.legacyTransactions) {
        const gasPrice = bumpTheGasPrice(config, {
            gasPrice: await getLegacyTransactionGasPrice(config, { logger })
        })
        return {
            maxFeePerGas: maxBigInt(gasPrice.maxFeePerGas, maxFeePerGas),
            maxPriorityFeePerGas: maxBigInt(
                gasPrice.maxPriorityFeePerGas,
                maxPriorityFeePerGas
            )
        }
    }

    const estimatedPrice = await estimateGasPrice(config, { logger })

    maxFeePerGas = estimatedPrice.maxFeePerGas
    maxPriorityFeePerGas = estimatedPrice.maxPriorityFeePerGas

    const gasPrice = bumpTheGasPrice(config, {
        gasPrice: { maxFeePerGas, maxPriorityFeePerGas }
    })
    return {
        maxFeePerGas: maxBigInt(gasPrice.maxFeePerGas, maxFeePerGas),
        maxPriorityFeePerGas: maxBigInt(
            gasPrice.maxPriorityFeePerGas,
            maxPriorityFeePerGas
        )
    }
}

const saveMaxFeePerGas = (
    state: GasPriceManagerState,
    { maxFeePerGas, timestamp }: { maxFeePerGas: bigint; timestamp: number }
) => {
    const queue = state.queueMaxFeePerGas
    const last = queue.length > 0 ? queue[queue.length - 1] : null

    if (!last || timestamp - last.timestamp >= 1000) {
        if (queue.length >= state.maxQueueSize) {
            queue.shift()
        }
        queue.push({ maxFeePerGas, timestamp })
    } else if (maxFeePerGas < last.maxFeePerGas) {
        last.maxFeePerGas = maxFeePerGas
        last.timestamp = timestamp
    }
}

const saveMaxPriorityFeePerGas = (
    state: GasPriceManagerState,
    {
        maxPriorityFeePerGas,
        timestamp
    }: { maxPriorityFeePerGas: bigint; timestamp: number }
) => {
    const queue = state.queueMaxPriorityFeePerGas
    const last = queue.length > 0 ? queue[queue.length - 1] : null

    if (!last || timestamp - last.timestamp >= 1000) {
        if (queue.length >= state.maxQueueSize) {
            queue.shift()
        }
        queue.push({ maxPriorityFeePerGas, timestamp })
    } else if (maxPriorityFeePerGas < last.maxPriorityFeePerGas) {
        last.maxPriorityFeePerGas = maxPriorityFeePerGas
        last.timestamp = timestamp
    }
}

const updateGasPrice = async ({
    state,
    config,
    logger
}: {
    state: GasPriceManagerState
    config: AltoConfig
    logger: Logger
}): Promise<GasPriceParameters> => {
    const gasPrice = await innerGetGasPrice(config, {
        logger
    })

    const timestamp = Date.now()

    new Promise<void>((resolve) => {
        saveMaxFeePerGas(state, {
            maxFeePerGas: gasPrice.maxFeePerGas,
            timestamp
        })
        saveMaxPriorityFeePerGas(state, {
            maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
            timestamp
        })
        resolve()
    })

    return gasPrice
}

const saveBaseFeePerGas = (
    state: GasPriceManagerState,
    { baseFeePerGas, timestamp }: { baseFeePerGas: bigint; timestamp: number }
) => {
    const queue = state.queueBaseFeePerGas
    const last = queue.length > 0 ? queue[queue.length - 1] : null

    if (!last || timestamp - last.timestamp >= 1000) {
        if (queue.length >= state.maxQueueSize) {
            queue.shift()
        }
        queue.push({ baseFeePerGas, timestamp })
    } else if (baseFeePerGas < last.baseFeePerGas) {
        last.baseFeePerGas = baseFeePerGas
        last.timestamp = timestamp
    }
}

const updateBaseFee = async ({
    config,
    state
}: {
    config: AltoConfig
    state: GasPriceManagerState
}) => {
    const latestBlock = await config.publicClient.getBlock()
    if (latestBlock.baseFeePerGas === null) {
        throw new RpcError("block does not have baseFeePerGas")
    }

    const baseFeePerGas = latestBlock.baseFeePerGas
    saveBaseFeePerGas(state, { baseFeePerGas, timestamp: Date.now() })

    return baseFeePerGas
}

type GasPriceManagerState = {
    maxQueueSize: number
    queueBaseFeePerGas: {
        timestamp: number
        baseFeePerGas: bigint
    }[]
    queueMaxFeePerGas: {
        timestamp: number
        maxFeePerGas: bigint
    }[]
    queueMaxPriorityFeePerGas: {
        timestamp: number
        maxPriorityFeePerGas: bigint
    }[]
}

const getMinMaxFeePerGas = async ({
    state,
    config,
    logger
}: {
    state: GasPriceManagerState
    config: AltoConfig
    logger: Logger
}) => {
    if (state.queueMaxFeePerGas.length === 0) {
        await getGasPrice({ state, config, logger })
    }

    return state.queueMaxFeePerGas.reduce(
        (acc: bigint, cur) => minBigInt(cur.maxFeePerGas, acc),
        state.queueMaxFeePerGas[0].maxFeePerGas
    )
}

const getMinMaxPriorityFeePerGas = async ({
    state,
    config,
    logger
}: {
    state: GasPriceManagerState
    config: AltoConfig
    logger: Logger
}) => {
    if (state.queueMaxPriorityFeePerGas.length === 0) {
        await getGasPrice({ state, config, logger })
    }

    return state.queueMaxPriorityFeePerGas.reduce(
        (acc, cur) => minBigInt(cur.maxPriorityFeePerGas, acc),
        state.queueMaxPriorityFeePerGas[0].maxPriorityFeePerGas
    )
}

const getBaseFee = ({
    state,
    config
}: { state: GasPriceManagerState; config: AltoConfig }) => {
    if (config.legacyTransactions) {
        throw new RpcError("baseFee is not available for legacy transactions")
    }

    if (config.gasPriceRefreshInterval === 0) {
        return updateBaseFee({
            config,
            state
        })
    }

    const { baseFeePerGas } =
        state.queueBaseFeePerGas[state.queueBaseFeePerGas.length - 1]

    return Promise.resolve(baseFeePerGas)
}

const getGasPrice = ({
    state,
    config,
    logger
}: {
    state: GasPriceManagerState
    config: AltoConfig
    logger: Logger
}) => {
    if (config.gasPriceRefreshInterval === 0) {
        return updateGasPrice({
            state,
            config,
            logger
        })
    }

    const { maxPriorityFeePerGas } =
        state.queueMaxPriorityFeePerGas[
            state.queueMaxPriorityFeePerGas.length - 1
        ]

    const { maxFeePerGas } =
        state.queueMaxFeePerGas[state.queueMaxFeePerGas.length - 1]

    return Promise.resolve({
        maxFeePerGas,
        maxPriorityFeePerGas
    })
}

export type GasPriceManager = Awaited<ReturnType<typeof createGasPriceManager>>

export async function createGasPriceManager(config: AltoConfig) {
    const logger = config.logger.child(
        { module: "gas_price_manager" },
        {
            level: config.publicClientLogLevel || config.logLevel
        }
    )

    const state: GasPriceManagerState = {
        maxQueueSize: config.gasPriceExpiry,
        queueBaseFeePerGas: [],
        queueMaxFeePerGas: [],
        queueMaxPriorityFeePerGas: []
    }

    const arbitrumManager = createArbitrumManager(config.gasPriceExpiry)

    await Promise.all([
        updateGasPrice({
            state,
            config,
            logger
        }),
        config.legacyTransactions === false
            ? updateBaseFee({
                  config,
                  state
              })
            : Promise.resolve()
    ])

    if (config.gasPriceRefreshInterval > 0) {
        setInterval(() => {
            if (config.legacyTransactions === false) {
                updateBaseFee({
                    config,
                    state
                })
            }

            updateGasPrice({
                state,
                config,
                logger
            })
        }, config.gasPriceRefreshInterval * 1000)
    }

    return {
        arbitrumManager,
        getBaseFee: () => getBaseFee({ state, config }),
        getGasPrice: () => getGasPrice({ state, config, logger }),
        async getMaxBaseFeePerGas() {
            if (state.queueBaseFeePerGas.length === 0) {
                await getBaseFee({
                    state,
                    config
                })
            }

            return state.queueBaseFeePerGas.reduce(
                (acc: bigint, cur) => maxBigInt(cur.baseFeePerGas, acc),
                state.queueBaseFeePerGas[0].baseFeePerGas
            )
        },
        async validateGasPrice(gasPrice: GasPriceParameters) {
            let lowestMaxFeePerGas = await getMinMaxFeePerGas({
                state,
                config,
                logger
            })
            let lowestMaxPriorityFeePerGas = await getMinMaxPriorityFeePerGas({
                state,
                config,
                logger
            })

            if (config.chainType === "hedera") {
                lowestMaxFeePerGas /= 10n ** 9n
                lowestMaxPriorityFeePerGas /= 10n ** 9n
            }

            if (gasPrice.maxFeePerGas < lowestMaxFeePerGas) {
                throw new RpcError(
                    `maxFeePerGas must be at least ${lowestMaxFeePerGas} (current maxFeePerGas: ${gasPrice.maxFeePerGas}) - use pimlico_getUserOperationGasPrice to get the current gas price`
                )
            }

            if (gasPrice.maxPriorityFeePerGas < lowestMaxPriorityFeePerGas) {
                throw new RpcError(
                    `maxPriorityFeePerGas must be at least ${lowestMaxPriorityFeePerGas} (current maxPriorityFeePerGas: ${gasPrice.maxPriorityFeePerGas}) - use pimlico_getUserOperationGasPrice to get the current gas price`
                )
            }
        }
    }
}
