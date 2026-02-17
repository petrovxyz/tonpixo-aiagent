"use client"

import { useState, useEffect, useRef, Suspense, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCheckCircle, faSpinner, faArrowLeft, faClockRotateLeft, faWallet, faObjectGroup, faBookmark as faBookmarkSolid, faQuestion } from "@fortawesome/free-solid-svg-icons"
import { ArrowUpIcon, type ArrowUpIconHandle } from "@/components/icons/ArrowUpIcon"
import { faBookmark as faBookmarkOutline } from "@fortawesome/free-regular-svg-icons"
import axios from "axios"
import { Header } from "@/components/Header"
import { AnimatedText } from "@/components/MarkdownRenderer"
import { QABottomSheet, QAItem } from "@/components/QABottomSheet"
import { cn } from "@/lib/utils"
import { getApiUrl, getStreamUrl } from "@/lib/backendUrl"
import { useTelegram } from "@/context/TelegramContext"
import { useToast } from "@/components/Toast"
import { getAssetUrl } from "@/lib/assetsUrl"
import type { AddressBootstrapOptions, AddressDetailsData, Message } from "./types"
import {
    appendMessage,
    buildChatRoute,
    getAddressBootstrapState,
    mapStoredHistoryToMessages,
    removeTransientMessages,
    retryWithBackoff
} from "./bootstrapUtils"
import { fetchChatBootstrap, initChat, requestAccountSummary, saveChatMessage } from "./chatApi"
import { buildAddressDetailsFromSummary, buildErrorAddressDetails } from "./addressDetailsUtils"
import {
    ActionButton,
    AddressDetailsMessage,
    MessageBubble,
    parseStoredMessage,
    StreamingMessage
} from "./components/messageUi"

const BEST_PRACTICES_ITEM: QAItem = {
    id: 'best-practices',
    question: "Best practices",
    answer: "The more specific your prompt, the better the result. Always define clear timeframes, explicitly name the assets you are tracking, and state your desired format. Avoid vague questions. Instead, combine dates, actions, and filters to get desired insights.",
    image: getAssetUrl("images/banner_best_practices.webp")
}

const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const sanitizeMessage = (value: unknown): string | null => {
        if (typeof value !== "string") return null
        const stripped = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
        if (!stripped) return null
        const maxLength = 200
        if (stripped.length > maxLength) {
            return `${stripped.slice(0, maxLength - 3).trimEnd()}...`
        }
        return stripped
    }

    if (axios.isAxiosError(error)) {
        const data = error.response?.data
        const dataMessage = sanitizeMessage(data)
        if (dataMessage) return dataMessage
        if (data && typeof data === "object") {
            const record = data as Record<string, unknown>
            const errorMessage = sanitizeMessage(record.error)
            if (errorMessage) return errorMessage
            const detailMessage = sanitizeMessage(record.detail)
            if (detailMessage) return detailMessage
            const recordMessage = sanitizeMessage(record.message)
            if (recordMessage) return recordMessage
        }
        const fallbackMessage = sanitizeMessage(error.message)
        if (fallbackMessage) return fallbackMessage
        return fallback
    }
    const genericMessage = error instanceof Error ? sanitizeMessage(error.message) : null
    if (genericMessage) return genericMessage
    return fallback
}

function ChatContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const addressParam = searchParams.get("address")
    const chatIdParam = searchParams.get("chat_id")

    const { isMobile, user } = useTelegram()
    const { showToast } = useToast()
    const userId = user?.id ?? null

    const [messages, setMessages] = useState<Array<Message>>([])
    const [inputValue, setInputValue] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [count, setCount] = useState<number>(0)
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])
    const [jobId, setJobId] = useState<string | null>(null)
    const [streamingContent, setStreamingContent] = useState("")
    const [pendingAddress, setPendingAddress] = useState<string | null>(null)
    const [currentScanType, setCurrentScanType] = useState<string | null>(null)
    const [isFavourite, setIsFavourite] = useState(false)
    const [currentAddress, setCurrentAddress] = useState<string | null>(null)
    const [awaitingTransactionLimit, setAwaitingTransactionLimit] = useState(false)
    const [activeQA, setActiveQA] = useState<QAItem | null>(null)

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const arrowUpRef = useRef<ArrowUpIconHandle>(null)
    const streamingMsgIdRef = useRef<string | null>(null)
    const userRef = useRef(user)
    const showToastRef = useRef(showToast)
    const messagesRef = useRef<Array<Message>>([])
    const activeSessionRef = useRef(false) // Track if messages were added during this session
    const chatIdRef = useRef<string | null>(chatIdParam)
    const prevRouteChatIdRef = useRef<string | null>(chatIdParam)
    const activeHistoryRequestIdRef = useRef(0)
    const activeAddressBootstrapKeyRef = useRef<string | null>(null)
    const addressBootstrapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const addressBootstrapTimeoutOwnerRef = useRef<string | null>(null)
    const pollStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pollStatusOwnerJobIdRef = useRef<string | null>(null)
    const failedAutoBootstrapKeysRef = useRef<Set<string>>(new Set())
    const activeJobIdRef = useRef<string | null>(null) // Ref to track the currently active job for cleanup

    useEffect(() => {
        userRef.current = user
    }, [user])

    useEffect(() => {
        showToastRef.current = showToast
    }, [showToast])

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, streamingContent])

    // Reset volatile state when route switches to a different chat.
    useEffect(() => {
        if (prevRouteChatIdRef.current === chatIdParam) return
        prevRouteChatIdRef.current = chatIdParam

        // Preserve in-flight session state when URL catches up after ensureChatId().
        if (chatIdParam && activeSessionRef.current && chatIdRef.current === chatIdParam) {
            return
        }

        chatIdRef.current = chatIdParam
        activeSessionRef.current = false
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setIsLoading(false)
        setJobId(null)
        activeJobIdRef.current = null
        if (pollStatusTimeoutRef.current) {
            clearTimeout(pollStatusTimeoutRef.current)
            pollStatusTimeoutRef.current = null
        }
        pollStatusOwnerJobIdRef.current = null
        setMessages([])
        setStreamingContent("")
        streamingMsgIdRef.current = null
        setPendingAddress(null)
        setCurrentAddress(null)
        setCurrentScanType(null)
        setAwaitingTransactionLimit(false)
        setCount(0)
        setIsFavourite(false)
        if (addressBootstrapTimeoutRef.current) {
            clearTimeout(addressBootstrapTimeoutRef.current)
            addressBootstrapTimeoutRef.current = null
            addressBootstrapTimeoutOwnerRef.current = null
        }
        failedAutoBootstrapKeysRef.current.clear()
    }, [chatIdParam])



    // Cancel job function
    const cancelJob = async (jobIdToCancel: string) => {
        try {
            const apiUrl = getApiUrl()
            await axios.post(`${apiUrl}/api/cancel/${jobIdToCancel}`)
            console.log(`Job ${jobIdToCancel} cancelled`)
        } catch (err) {
            console.error('Error cancelling job:', err)
        }
    }

    // Cleanup on unmount - cancel any active jobs
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
                abortControllerRef.current = null
            }
            if (addressBootstrapTimeoutRef.current) {
                clearTimeout(addressBootstrapTimeoutRef.current)
                addressBootstrapTimeoutRef.current = null
                addressBootstrapTimeoutOwnerRef.current = null
            }
            if (pollStatusTimeoutRef.current) {
                clearTimeout(pollStatusTimeoutRef.current)
                pollStatusTimeoutRef.current = null
            }
            pollStatusOwnerJobIdRef.current = null
            activeAddressBootstrapKeyRef.current = null
            // Cancel any in-progress job when leaving chat
            if (activeJobIdRef.current) {
                cancelJob(activeJobIdRef.current)
            }
        }
    }, [])

    // Check favourite status when address changes
    useEffect(() => {
        const checkFavourite = async () => {
            const addressToCheck = currentAddress || pendingAddress || addressParam
            if (!addressToCheck || !user?.id) {
                setIsFavourite(false)
                return
            }

            try {
                const apiUrl = getApiUrl()
                const response = await axios.get(`${apiUrl}/api/favourites/check/${encodeURIComponent(addressToCheck)}`, {
                    params: { user_id: user.id }
                })
                setIsFavourite(response.data.is_favourite || false)
            } catch (err) {
                console.error('Error checking favourite:', err)
                setIsFavourite(false)
            }
        }

        checkFavourite()
    }, [currentAddress, pendingAddress, addressParam, user?.id])

    // Toggle favourite handler
    const handleToggleFavourite = async () => {
        const addressToToggle = currentAddress || pendingAddress || addressParam
        if (!addressToToggle || !user?.id) {
            showToast("No address to favourite", "error")
            return
        }

        const apiUrl = getApiUrl()

        try {
            if (isFavourite) {
                await axios.delete(`${apiUrl}/api/favourites/${encodeURIComponent(addressToToggle)}`, {
                    params: { user_id: user.id }
                })
                setIsFavourite(false)
                showToast("Removed from favourites", "success")
            } else {
                await axios.post(`${apiUrl}/api/favourites`, {
                    user_id: user.id,
                    address: addressToToggle
                })
                setIsFavourite(true)
                showToast("Added to favourites", "success")
            }
        } catch (err) {
            console.error('Error toggling favourite:', err)
            showToast("Failed to update favourite", "error")
        }
    }

    // Generate Chat ID if needed when starting interaction
    const ensureChatId = useCallback(() => {
        if (chatIdRef.current) {
            console.log(`[CHAT-ID] Returning existing chatId: ${chatIdRef.current}`)
            return chatIdRef.current
        }

        if (chatIdParam) {
            chatIdRef.current = chatIdParam
            return chatIdParam
        }

        const newId = crypto.randomUUID()
        console.log(`[CHAT-ID] Creating NEW chatId: ${newId}`)
        chatIdRef.current = newId

        router.replace(buildChatRoute(newId, addressParam))
        return newId
    }, [addressParam, chatIdParam, router])

    // Load chat history / bootstrap address chat deterministically.
    useEffect(() => {
        let cancelled = false

        const loadHistory = async () => {
            if (!chatIdParam && addressParam) {
                ensureChatId()
                return
            }

            if (!chatIdParam) {
                if (messagesRef.current.length === 0) {
                    setMessages([{
                        id: crypto.randomUUID(),
                        role: "agent",
                        content: "Welcome! Share a TON wallet address to start the analysis.",
                        timestamp: new Date(),
                        isSystemMessage: true,
                        metaKey: "welcome"
                    }])
                }
                return
            }

            if (!userId) return

            const requestId = ++activeHistoryRequestIdRef.current
            console.log(`[CHAT] Loading history for chat ${chatIdParam}`)
            chatIdRef.current = chatIdParam
            setIsLoading(true)

            try {
                const { meta, history } = await fetchChatBootstrap(chatIdParam, userId)

                if (cancelled || requestId !== activeHistoryRequestIdRef.current) {
                    return
                }

                const isNewAddressBootstrap = Boolean(addressParam) && meta.error === "Chat not found"

                if (meta.error && !isNewAddressBootstrap) {
                    throw new Error(meta.error)
                }
                if (history.error && !isNewAddressBootstrap) {
                    throw new Error(history.error)
                }

                if (isNewAddressBootstrap) {
                    console.log(`[CHAT] Chat ${chatIdParam} not found; treating as new address bootstrap`)
                }

                if (meta && !meta.error) {
                    if (meta.job_id) {
                        setJobId(meta.job_id)
                        activeJobIdRef.current = meta.job_id
                    }
                    if (meta.address) {
                        setCurrentAddress(meta.address)
                    }
                }

                const historyMessages = Array.isArray(history.messages)
                    ? history.messages
                    : []

                if (historyMessages.length > 0) {
                    const loadedMessages = mapStoredHistoryToMessages(historyMessages, parseStoredMessage)
                    console.log(`[CHAT] Loaded ${loadedMessages.length} messages from history`)
                    setMessages(loadedMessages)
                } else {
                    setMessages([])
                }

                if (addressParam) {
                    const bootstrapState = getAddressBootstrapState(historyMessages, addressParam)
                    const bootstrapKey = `${chatIdParam}:${addressParam}`

                    if (bootstrapState.shouldBootstrap && !failedAutoBootstrapKeysRef.current.has(bootstrapKey)) {
                        await handleAddressReceived(addressParam, {
                            persistSearchMessage: bootstrapState.persistSearchMessage,
                            source: "auto"
                        })
                    }
                }
            } catch (error) {
                console.error("Failed to load history:", error)
                const errorMsg = getApiErrorMessage(error, "Unknown error")

                if (errorMsg.includes("Access denied")) {
                    showToastRef.current("Access denied: you cannot view this chat", "error")
                    setTimeout(() => router.push('/explore'), 2000)
                } else {
                    showToastRef.current("Failed to load chat history", "error")
                }
            } finally {
                if (!cancelled && requestId === activeHistoryRequestIdRef.current) {
                    setIsLoading(false)
                }
            }
        }

        void loadHistory()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addressParam, chatIdParam, ensureChatId, router, userId])

    // Get scan type label for messages
    const getScanTypeLabel = (scanType: string) => {
        switch (scanType) {
            case 'jettons': return 'jettons'
            case 'nfts': return 'NFTs'
            default: return 'transactions'
        }
    }

    const handleFeedback = async (score: number, traceId: string) => {
        if (!traceId) {
            console.warn("Feedback attempted without traceId")
            showToast("Unable to save feedback - try again", "error")
            return
        }
        try {
            const apiUrl = getApiUrl()
            await axios.post(`${apiUrl}/api/score`, {
                trace_id: traceId,
                score: score,
                name: "user-feedback"
            })
            showToast("Thanks for your feedback!", "success")
        } catch (error) {
            console.error("Feedback error:", error)
            showToast("Failed to send feedback", "error")
        }
    }

    const handleCopy = (text: string) => {
        if (!text) return
        navigator.clipboard.writeText(text)
        showToast("Copied to clipboard", "info")
    }

    // Existing Polling Logic
    const pollStatus = async (jobId: string, scanType: string, targetAddress: string) => {
        const isCurrentJob = () => activeJobIdRef.current === jobId

        if (!isCurrentJob()) {
            return
        }

        try {
            const apiUrl = getApiUrl()
            const response = await axios.get(`${apiUrl}/api/status/${jobId}`)
            if (!isCurrentJob()) {
                return
            }
            const data = response.data

            if (data.status === "processing" || data.status === "queued") {
                setCount(data.count || 0)
                if (isCurrentJob()) {
                    if (
                        pollStatusTimeoutRef.current &&
                        pollStatusOwnerJobIdRef.current === jobId
                    ) {
                        clearTimeout(pollStatusTimeoutRef.current)
                        pollStatusTimeoutRef.current = null
                        pollStatusOwnerJobIdRef.current = null
                    }
                    pollStatusOwnerJobIdRef.current = jobId
                    pollStatusTimeoutRef.current = setTimeout(() => {
                        if (
                            pollStatusOwnerJobIdRef.current === jobId &&
                            activeJobIdRef.current === jobId
                        ) {
                            void pollStatus(jobId, scanType, targetAddress)
                        }
                    }, 1000)
                }
            } else if (data.status === "success") {
                if (!isCurrentJob()) {
                    return
                }
                setIsLoading(false)
                setJobId(jobId)

                // Only save to backend if chat was already initialized (from handleAddressReceived)
                const currentChatId = chatIdRef.current

                if (userRef.current && currentChatId) {
                    try {
                        const scanLabels: Record<string, string> = {
                            'transactions': 'Transactions',
                            'jettons': 'Jettons',
                            'nfts': 'NFTs'
                        }
                        const userMessage = `Scan ${scanLabels[scanType] || scanType}`
                        // Construct markdown for agent message
                        const agentMarkdown = `### Analysis complete\n\nI'm done! ${data.count} ${getScanTypeLabel(scanType)} have been scanned and I'm ready for your questions.`

                        // Chat already initialized in handleAddressReceived - just save messages
                        // 1. Save User Message (scan type selection)
                        await axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                            role: "user",
                            content: userMessage
                        })
                        if (!isCurrentJob()) {
                            return
                        }

                        // 2. Save Agent Message (analysis complete)
                        await axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                            role: "agent",
                            content: agentMarkdown
                        })
                        if (!isCurrentJob()) {
                            return
                        }

                        // Update chat with job_id (without re-initializing)
                        await axios.post(`${apiUrl}/api/chat/init`, {
                            chat_id: currentChatId,
                            user_id: userRef.current.id,
                            job_id: jobId,
                            address: targetAddress
                        })
                        if (!isCurrentJob()) {
                            return
                        }

                    } catch (e) {
                        console.error("Failed to save messages:", e)
                    }
                }

                if (!isCurrentJob()) {
                    return
                }

                addMessage("agent", (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center font-bold text-white gap-1">
                            <FontAwesomeIcon icon={faCheckCircle} />
                            <span><AnimatedText isAgent={true}>Analysis complete</AnimatedText></span>
                        </div>
                        <p className="text-white/90">
                            <AnimatedText isAgent={true}>
                                I&apos;m done! {data.count} {getScanTypeLabel(scanType)} have been scanned and I&apos;m ready for your questions.
                            </AnimatedText>
                        </p>
                    </div>
                ), false, undefined, true)
                removeLoadingMessage()
                activeJobIdRef.current = null  // Job completed, clear active job
                if (pollStatusTimeoutRef.current && pollStatusOwnerJobIdRef.current === jobId) {
                    clearTimeout(pollStatusTimeoutRef.current)
                    pollStatusTimeoutRef.current = null
                }
                pollStatusOwnerJobIdRef.current = null
            } else if (data.status === "empty") {
                if (!isCurrentJob()) {
                    return
                }
                setIsLoading(false)
                removeLoadingMessage()
                addMessage("agent", `I couldn't find any ${getScanTypeLabel(scanType)} for this address.`, false, undefined, true)
                activeJobIdRef.current = null  // Job completed, clear active job
                if (pollStatusTimeoutRef.current && pollStatusOwnerJobIdRef.current === jobId) {
                    clearTimeout(pollStatusTimeoutRef.current)
                    pollStatusTimeoutRef.current = null
                }
                pollStatusOwnerJobIdRef.current = null
            } else if (data.status === "error") {
                if (!isCurrentJob()) {
                    return
                }
                setIsLoading(false)
                removeLoadingMessage()
                addMessage("agent", `Error: ${data.error || "Failed to generate history"}`, false, undefined, true)
                activeJobIdRef.current = null  // Job completed, clear active job
                if (pollStatusTimeoutRef.current && pollStatusOwnerJobIdRef.current === jobId) {
                    clearTimeout(pollStatusTimeoutRef.current)
                    pollStatusTimeoutRef.current = null
                }
                pollStatusOwnerJobIdRef.current = null
            } else if (data.status === "cancelled") {
                if (!isCurrentJob()) {
                    return
                }
                setIsLoading(false)
                removeLoadingMessage()
                activeJobIdRef.current = null  // Job was cancelled
                if (pollStatusTimeoutRef.current && pollStatusOwnerJobIdRef.current === jobId) {
                    clearTimeout(pollStatusTimeoutRef.current)
                    pollStatusTimeoutRef.current = null
                }
                pollStatusOwnerJobIdRef.current = null
            }
        } catch (err) {
            if (!isCurrentJob()) {
                return
            }
            console.error("[SCAN] Connection to background service lost:", err)
            setIsLoading(false)
            removeLoadingMessage()
            addMessage("agent", "Connection to background service lost.", false, undefined, true)
            activeJobIdRef.current = null
            if (pollStatusTimeoutRef.current && pollStatusOwnerJobIdRef.current === jobId) {
                clearTimeout(pollStatusTimeoutRef.current)
                pollStatusTimeoutRef.current = null
            }
            pollStatusOwnerJobIdRef.current = null
        }
    }

    const startSearch = async (targetAddress: string, scanType: string, limit?: number) => {
        setIsLoading(true)
        setCurrentScanType(scanType)
        setMessages(prev => [...prev.filter(m => m.content !== "collecting"), {
            id: "loading-state-" + Date.now(),
            role: "agent",
            content: "collecting",
            timestamp: new Date()
        }])

        try {
            const apiUrl = getApiUrl()
            const response = await axios.post(`${apiUrl}/api/generate`, {
                address: targetAddress,
                scan_type: scanType,
                limit: limit
            })

            if (response.data.job_id) {
                activeJobIdRef.current = response.data.job_id  // Track active job for cleanup
                pollStatusOwnerJobIdRef.current = response.data.job_id
                pollStatus(response.data.job_id, scanType, targetAddress)
            }
        } catch (error) {
            removeLoadingMessage()
            const errorMsg = getApiErrorMessage(error, "Failed to start generation.")
            addMessage("agent", errorMsg, false, undefined, true)
            setIsLoading(false)
        }
    }

    // Show scan type selection buttons
    const showScanTypeSelection = (address: string) => {
        addMessage("agent", (
            <div className="flex flex-col gap-4">
                <p className="text-white">
                    <AnimatedText isAgent={true}>
                        What would you like me to scan?
                    </AnimatedText>
                </p>
                <div className="flex flex-col gap-2">
                    <motion.div variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}>
                        <ActionButton
                            onClick={() => handleScanTypeSelect(address, 'transactions')}
                            icon={<FontAwesomeIcon icon={faClockRotateLeft} />}
                            variant="primary"
                        >
                            Transactions
                        </ActionButton>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}>
                        <ActionButton
                            onClick={() => handleScanTypeSelect(address, 'jettons')}
                            icon={<FontAwesomeIcon icon={faWallet} />}
                            variant="primary"
                        >
                            Jettons
                        </ActionButton>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}>
                        <ActionButton
                            onClick={() => handleScanTypeSelect(address, 'nfts')}
                            icon={<FontAwesomeIcon icon={faObjectGroup} />}
                            variant="primary"
                        >
                            NFTs
                        </ActionButton>
                    </motion.div>
                </div>
            </div>
        ), false, undefined, true, `scan-options:${address}`)
    }

    // Handle address detection and show acknowledgment
    const handleAddressReceived = async (address: string, options: AddressBootstrapOptions = {}) => {
        const currentChatId = ensureChatId()
        const bootstrapKey = `${currentChatId}:${address}`
        const loadingMetaKey = `address-loading:${bootstrapKey}`
        const addressDetailsMetaKey = `address-details:${bootstrapKey}`
        const searchPrompt = `Search: ${address}`
        const persistSearchMessage = options.persistSearchMessage ?? true
        const source = options.source ?? "manual"
        const isActiveBootstrap = () => activeAddressBootstrapKeyRef.current === bootstrapKey

        if (source === "manual") {
            failedAutoBootstrapKeysRef.current.delete(bootstrapKey)
        } else if (failedAutoBootstrapKeysRef.current.has(bootstrapKey)) {
            return
        }

        if (activeAddressBootstrapKeyRef.current === bootstrapKey) {
            return
        }
        activeAddressBootstrapKeyRef.current = bootstrapKey

        // Mark session as active to prevent history overwrite while bootstrapping.
        activeSessionRef.current = true
        setPendingAddress(address)
        setCurrentAddress(address)

        const hasSearchPromptInUi = messagesRef.current.some(
            msg => msg.role === "user" && typeof msg.content === "string" && msg.content.trim() === searchPrompt
        )
        if (!hasSearchPromptInUi) {
            addMessage("user", searchPrompt, false, undefined, false, `search:${bootstrapKey}`)
        }

        addMessage("agent", (
            <div className="flex items-center gap-2 text-white/80">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                <span>Fetching account details...</span>
            </div>
        ), false, undefined, true, loadingMetaKey)

        try {
            if (userRef.current) {
                try {
                    await initChat({
                        chatId: currentChatId,
                        userId: userRef.current.id,
                        title: `Address: ${address.slice(0, 8)}...${address.slice(-6)}`,
                        address
                    })
                    if (!isActiveBootstrap()) return

                    if (persistSearchMessage) {
                        await saveChatMessage(currentChatId, {
                            role: "user",
                            content: searchPrompt,
                            idempotency_key: `bootstrap:user:${bootstrapKey}`
                        })
                        if (!isActiveBootstrap()) return
                    }
                } catch (saveError) {
                    console.error("Failed to initialize chat before summary fetch:", saveError)
                }
            }

            if (!isActiveBootstrap()) return

            const response = await retryWithBackoff(
                () => requestAccountSummary(address),
                3,
                400
            )
            if (!isActiveBootstrap()) return
            setMessages(prev => prev.filter(m => m.metaKey !== loadingMetaKey))

            let addressDetailsJson: AddressDetailsData
            if (response.data.error) {
                addressDetailsJson = buildErrorAddressDetails(address)
            } else {
                addressDetailsJson = buildAddressDetailsFromSummary(address, response.data)
            }

            addMessage("agent", (
                <AddressDetailsMessage
                    data={addressDetailsJson}
                    animate={true}
                />
            ), false, undefined, true, addressDetailsMetaKey)

            if (userRef.current) {
                try {
                    await saveChatMessage(currentChatId, {
                        role: "agent",
                        content: JSON.stringify(addressDetailsJson),
                        idempotency_key: `bootstrap:agent:${bootstrapKey}`
                    })
                    if (!isActiveBootstrap()) return
                } catch (saveError) {
                    console.error("Failed to save address details to history:", saveError)
                }
            }
            if (!isActiveBootstrap()) return
            failedAutoBootstrapKeysRef.current.delete(bootstrapKey)
        } catch (err) {
            if (!isActiveBootstrap()) return
            console.error("[ACCOUNT] Failed to fetch account summary:", err)
            if (source === "auto") {
                failedAutoBootstrapKeysRef.current.add(bootstrapKey)
            }
            setMessages(prev => prev.filter(m => m.metaKey !== loadingMetaKey))
            addMessage("agent", (
                <AddressDetailsMessage
                    data={buildErrorAddressDetails(address)}
                    animate={true}
                />
            ), false, undefined, true, addressDetailsMetaKey)
        } finally {
            if (isActiveBootstrap()) {
                if (
                    addressBootstrapTimeoutRef.current &&
                    addressBootstrapTimeoutOwnerRef.current === bootstrapKey
                ) {
                    clearTimeout(addressBootstrapTimeoutRef.current)
                    addressBootstrapTimeoutRef.current = null
                    addressBootstrapTimeoutOwnerRef.current = null
                }
                addressBootstrapTimeoutRef.current = setTimeout(() => {
                    if (
                        addressBootstrapTimeoutOwnerRef.current === bootstrapKey &&
                        isActiveBootstrap()
                    ) {
                        addressBootstrapTimeoutRef.current = null
                        addressBootstrapTimeoutOwnerRef.current = null
                        showScanTypeSelection(address)
                        if (activeAddressBootstrapKeyRef.current === bootstrapKey) {
                            activeAddressBootstrapKeyRef.current = null
                        }
                    }
                }, 500)
                addressBootstrapTimeoutOwnerRef.current = bootstrapKey
            }
        }
    }

    // Handle scan type button click
    const handleScanTypeSelect = (address: string, scanType: string) => {
        const labels: Record<string, string> = {
            'transactions': 'Transactions',
            'jettons': 'Jettons',
            'nfts': 'NFTs'
        }

        // If user selected Transactions, ask for limit preference
        if (scanType === 'transactions') {
            addMessage("user", "Scan Transactions")

            // Save this interaction to backend so it persists
            const currentChatId = chatIdRef.current
            if (currentChatId) {
                const apiUrl = getApiUrl()
                axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                    role: "agent",
                    content: "Would you like to scan all transactions or a specific amount?"
                }).catch(console.error)
            }

            // Show options
            addMessage("agent", (
                <div className="flex flex-col gap-4">
                    <p className="text-white">
                        <AnimatedText isAgent={true}>
                            Would you like to scan all transactions or a specific amount?
                        </AnimatedText>
                    </p>
                    <div className="flex flex-col gap-2">
                        <motion.div variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}>
                            <ActionButton
                                onClick={() => {
                                    addMessage("user", "All transactions")
                                    setPendingAddress(null)
                                    startSearch(address, 'transactions')
                                }}
                                variant="primary"
                            >
                                All transactions
                            </ActionButton>
                        </motion.div>
                        <motion.div variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}>
                            <ActionButton
                                onClick={() => {
                                    addMessage("user", "Specific amount", false, undefined, true)
                                    // Save the question to history
                                    const currentChatId = chatIdRef.current
                                    if (currentChatId) {
                                        const apiUrl = getApiUrl()
                                        axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                                            role: "agent",
                                            content: "How many transactions do you want to scan? Please enter a number."
                                        }).catch(console.error)
                                    }

                                    addMessage("agent", "How many transactions do you want to scan? Please enter a number.", false, undefined, true)
                                    setAwaitingTransactionLimit(true)
                                    setPendingAddress(address) // Keep address pending so we know which one to scan
                                }}
                                variant="primary"
                            >
                                Only specific amount
                            </ActionButton>
                        </motion.div>
                    </div>
                </div>
            ), false, undefined, true)
            return
        }

        addMessage("user", `Scan ${labels[scanType]}`)
        setPendingAddress(null)
        startSearch(address, scanType)
    }



    const addMessage = (
        role: "user" | "agent",
        content: React.ReactNode,
        isStreaming = false,
        traceId?: string,
        isSystemMessage = false,
        metaKey?: string
    ) => {
        // Mark that we're in an active session to prevent loadHistory from overwriting
        activeSessionRef.current = true
        setMessages(prev => appendMessage(prev, {
            id: Math.random().toString(36).substring(2, 11),
            role,
            content,
            timestamp: new Date(),
            isStreaming,
            traceId,
            isSystemMessage,
            metaKey
        }))
    }

    const removeLoadingMessage = () => {
        setMessages(removeTransientMessages)
    }

    // Stream chat with SSE
    const streamChat = useCallback(async (question: string) => {
        // Use separate streaming URL for Lambda Function URL (supports SSE properly)
        // Falls back to regular API URL for local development
        const streamUrl = getStreamUrl()
        const apiUrl = getApiUrl()

        console.log("[STREAM] Starting stream to:", streamUrl)
        console.log("[STREAM] API URL:", apiUrl)

        // Abort any existing stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        abortControllerRef.current = new AbortController()

        setIsLoading(true)
        setStreamingContent("")

        // Add a streaming message placeholder with thinking state
        const streamingMsgId = "streaming-" + Date.now()
        streamingMsgIdRef.current = streamingMsgId

        // Mark session as active to prevent history overwrite if URL updates
        activeSessionRef.current = true

        setMessages(prev => [...prev.filter(m => !m.isStreaming), {
            id: streamingMsgId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            isStreaming: true,
            streamingText: "",
            isAnalyzing: false
        }])

        try {
            console.log("[STREAM] Fetching...")
            const response = await fetch(`${streamUrl}/api/chat/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    job_id: jobId,
                    question: question,
                    chat_id: ensureChatId(),
                    user_id: user?.id
                }),
                signal: abortControllerRef.current.signal
            })

            console.log("[STREAM] Response status:", response.status)
            console.log("[STREAM] Response headers:", Object.fromEntries(response.headers.entries()))

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const reader = response.body?.getReader()
            if (!reader) {
                throw new Error("No reader available")
            }

            console.log("[STREAM] Got reader, starting to read...")

            const decoder = new TextDecoder()
            let accumulatedContent = ""
            let accumulatedThinking = ""
            let currentlyAnalyzing = false
            let buffer = ""
            let chunkCount = 0

            while (true) {
                const { done, value } = await reader.read()

                if (done) {
                    console.log("[STREAM] Stream done, total chunks:", chunkCount)
                    break
                }

                chunkCount++
                let text = decoder.decode(value, { stream: true })
                console.log("[STREAM] Chunk", chunkCount, "raw text:", text.substring(0, 200))

                // Fallback: Check if response is wrapped in Lambda proxy format (old Mangum behavior)
                // Lambda Web Adapter should send proper streaming, but keep this as fallback
                if (text.startsWith('{"statusCode":')) {
                    try {
                        const proxyResponse = JSON.parse(text)
                        if (proxyResponse.body) {
                            console.log("[STREAM] Detected Lambda proxy response (fallback), extracting body")
                            text = proxyResponse.body
                        }
                    } catch (err) {
                        console.error("[STREAM] Failed to parse proxy response:", err)
                        // Not a complete JSON, might be partial - continue with raw text
                    }
                }

                buffer += text

                // Split by newline, but keep the last segment in the buffer as it might be incomplete
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                    if (line.trim().startsWith("data: ")) {
                        try {
                            const jsonStr = line.trim().slice(6)
                            console.log("[STREAM] Parsing JSON:", jsonStr.substring(0, 100))
                            const data = JSON.parse(jsonStr)
                            console.log("[STREAM] Event type:", data.type)

                            if (data.type === "token") {
                                accumulatedContent += data.content
                                setStreamingContent(accumulatedContent)

                                // Update the streaming message with new content
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, streamingText: accumulatedContent, thinkingText: accumulatedThinking || undefined, isAnalyzing: currentlyAnalyzing }
                                        : m
                                ))
                            } else if (data.type === "thinking") {
                                // Accumulate thinking/reasoning content
                                accumulatedThinking += data.content
                                // Update message with thinking content
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, thinkingText: accumulatedThinking, isAnalyzing: currentlyAnalyzing }
                                        : m
                                ))
                            } else if (data.type === "tool_start") {
                                currentlyAnalyzing = true
                                // Update message to show analyzing state
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, isAnalyzing: true }
                                        : m
                                ))
                            } else if (data.type === "tool_end") {
                                currentlyAnalyzing = false
                                // Update message to hide analyzing state
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, isAnalyzing: false }
                                        : m
                                ))
                            } else if (data.type === "done") {
                                console.log("[STREAM] Got done event, finalizing with content length:", accumulatedContent.length, "thinking length:", accumulatedThinking.length)
                                // Finalize the message - preserve traceId and thinking
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? {
                                            ...m,
                                            content: accumulatedContent,
                                            thinkingText: accumulatedThinking || undefined,
                                            isStreaming: false,
                                            streamingText: undefined,
                                            isAnalyzing: false,
                                            timestamp: new Date(),
                                            traceId: m.traceId
                                        }
                                        : m
                                ))
                                setStreamingContent("")
                                streamingMsgIdRef.current = null
                            } else if (data.type === "trace_id") {
                                console.log("[STREAM] Got trace_id:", data.content)
                                // Update message to include traceId
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, traceId: data.content }
                                        : m
                                ))
                            } else if (data.type === "error") {
                                console.log("[STREAM] Got error:", data.content)
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, content: data.content, isStreaming: false, streamingText: undefined, isAnalyzing: false, timestamp: new Date() }
                                        : m
                                ))
                                streamingMsgIdRef.current = null
                            }
                        } catch (e) {
                            // Skip invalid JSON
                            console.warn("[STREAM] Failed to parse SSE JSON:", e, "line:", line)
                        }
                    }
                }
            }

            console.log("[STREAM] Loop ended, accumulated content length:", accumulatedContent.length)
            console.log("[STREAM] Remaining buffer:", buffer)

            // If we got content but no "done" event, finalize anyway - preserve traceId
            if (accumulatedContent && streamingMsgIdRef.current) {
                console.log("[STREAM] Finalizing without done event")
                setMessages(prev => prev.map(m =>
                    m.id === streamingMsgId
                        ? { ...m, content: accumulatedContent, isStreaming: false, streamingText: undefined, isAnalyzing: false, timestamp: new Date(), traceId: m.traceId }
                        : m
                ))
                streamingMsgIdRef.current = null
            }

        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                console.log('[STREAM] Aborted')
                return
            }

            console.error('[STREAM] Error:', err)

            // Fallback to non-streaming API
            try {
                const response = await axios.post(`${apiUrl}/api/chat`, {
                    job_id: jobId,
                    question: question
                })

                setMessages(prev => prev.filter(m => m.id !== streamingMsgId))
                const responseData = response.data
                addMessage("agent", responseData.answer || "I couldn't get an answer.", false, responseData.trace_id)
            } catch (err) {
                console.error("[STREAM] Fallback request failed:", err)
                setMessages(prev => prev.filter(m => m.id !== streamingMsgId))
                addMessage("agent", "I encountered an error talking to the agent.")
            }
            streamingMsgIdRef.current = null
        } finally {
            setIsLoading(false)
            setStreamingContent("")
        }
    }, [jobId, user?.id, ensureChatId])

    const handleSend = async () => {
        if (!inputValue.trim()) return
        const text = inputValue.trim()
        setInputValue("")

        // Handle Transaction Limit Input
        if (awaitingTransactionLimit && pendingAddress) {
            const limit = parseInt(text)
            if (isNaN(limit) || limit <= 0) {
                addMessage("agent", "Please enter a valid positive number.", false, undefined, true)
                return
            }

            addMessage("user", text)
            setAwaitingTransactionLimit(false)
            const addressToScan = pendingAddress
            setPendingAddress(null)
            startSearch(addressToScan, 'transactions', limit)
            return
        }

        addMessage("user", text)

        if (!jobId) {
            // Check if it's an address
            if (text.length > 20 && (text.startsWith("EQ") || text.startsWith("UQ") || text.startsWith("0:"))) {
                // Don't start scanning immediately - show address acknowledgment first
                handleAddressReceived(text, { source: "manual" })
            } else if (pendingAddress) {
                // User typed something else while we have a pending address
                addMessage("agent", "Please select one of the scan options above, or paste a new TON address.", false, undefined, true)
            } else {
                setIsLoading(true)
                setTimeout(() => {
                    setIsLoading(false)
                    addMessage("agent", "I'm ready to analyze any TON address. Please paste one here!", false, undefined, true)
                }, 800)
            }
            return
        }

        // Use streaming for chat responses
        await streamChat(text)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="relative w-full h-[100dvh] flex flex-col">
            {/* Main Scrollable Area */}
            <div className="flex-1 overflow-y-auto z-10 scroll-smooth scrollbar-hide">
                <div className="max-w-2xl mx-auto w-full min-h-full flex flex-col justify-end pt-44 pb-32">
                    <AnimatePresence initial={true}>
                        {messages.map((msg) => (
                            <div key={msg.id}>
                                {msg.content === "collecting" ? (
                                    <MessageBubble role="agent" timestamp={msg.timestamp} userPhotoUrl={user?.photo_url} isSystemMessage={true} content={
                                        <div className="flex items-center gap-4">
                                            <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                                                <FontAwesomeIcon icon={faSpinner} className="animate-spin text-white/80 text-xl" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="animate-pulse font-semibold">
                                                    {currentScanType === 'jettons' ? 'Scanning Jetton Balances...' :
                                                        currentScanType === 'nfts' ? 'Scanning NFT Collection...' :
                                                            'Scanning TON Blockchain...'}
                                                </span>
                                                {count > 0 && <span className="text-xs text-white/50">{count} {getScanTypeLabel(currentScanType || 'transactions')} detected</span>}
                                            </div>
                                        </div>
                                    } />
                                ) : msg.content === "thinking" ? (
                                    <MessageBubble role="agent" timestamp={msg.timestamp} userPhotoUrl={user?.photo_url} content={
                                        <div className="flex items-center gap-2 text-white/80">
                                            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                                            <span className="animate-pulse italic">Thinking...</span>
                                        </div>
                                    } />
                                ) : msg.isStreaming ? (
                                    <MessageBubble
                                        role="agent"
                                        content={<StreamingMessage content={msg.streamingText || ""} isThinking={msg.isAnalyzing || false} />}
                                        timestamp={msg.timestamp}
                                        isStreaming={true}
                                        userPhotoUrl={user?.photo_url}
                                    />
                                ) : (
                                    <MessageBubble
                                        role={msg.role}
                                        content={msg.content}
                                        timestamp={msg.timestamp}
                                        isStreaming={msg.isStreaming}
                                        userPhotoUrl={user?.photo_url}
                                        traceId={msg.traceId}
                                        onFeedback={handleFeedback}
                                        onCopy={handleCopy}
                                        isSystemMessage={msg.isSystemMessage}
                                        thinkingText={msg.thinkingText}
                                    />
                                )}
                            </div>
                        ))}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-20 pointer-events-none">
                {/* Backdrop */}
                <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#4FC3F7]/80 via-[#4FC3F7]/40 to-transparent -z-10" />


                <div className="max-w-3xl mx-auto w-full px-4 relative">
                    <div className="flex items-center gap-2 pointer-events-auto">

                        <button
                            onClick={() => router.push("/explore")}
                            className={cn(
                                "flex items-center justify-center w-14 h-14 bg-[#4FC3F7] border-2 border-white/20 rounded-full text-black hover:bg-[#67cbf8] transition-all shadow-lg active:scale-95 inset-shadow-sm inset-shadow-white/30 cursor-pointer",
                                isMobile ? "mt-24" : "mt-10"
                            )}
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="text-xl" />
                        </button>
                        <Header className="flex-1" />
                        <button
                            onClick={handleToggleFavourite}
                            disabled={!currentAddress && !pendingAddress && !addressParam}
                            className={cn(
                                "flex items-center justify-center text-black w-14 h-14 bg-[#4FC3F7] border-2 border-white/20 rounded-full hover:bg-[#67cbf8] transition-all shadow-lg active:scale-95 inset-shadow-sm inset-shadow-white/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                                isMobile ? "mt-24" : "mt-10"
                            )}
                        >
                            <FontAwesomeIcon icon={isFavourite ? faBookmarkSolid : faBookmarkOutline} className="text-xl" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Input Area */}
            <div id="chat-input-bar" className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
                {/* Backdrop */}
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#29B6F6]/80 via-[#29B6F6]/40 to-transparent -z-10" />


                <div className="max-w-2xl mx-auto w-full px-6 py-4 pointer-events-auto relative">
                    <div className="relative group">
                        <div className="absolute inset-0 rounded-full" />
                        <div
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const y = e.clientY - rect.top;
                                const size = Math.max(rect.width, rect.height);

                                const ripple = {
                                    id: Date.now(),
                                    x,
                                    y,
                                    size
                                };

                                setRipples((prev) => [...prev, ripple]);
                            }}
                            className="relative bg-[#4FC3F7] border border-white/20 rounded-full p-2 flex items-center shadow-2xl transition-all ring-1 ring-white/10 inset-shadow-sm inset-shadow-white/30 overflow-hidden"
                        >
                            <AnimatePresence>
                                {ripples.map((ripple) => (
                                    <motion.span
                                        key={ripple.id}
                                        initial={{ scale: 0, opacity: 0.35 }}
                                        animate={{ scale: 4, opacity: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                        onAnimationComplete={() => {
                                            setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
                                        }}
                                        className="absolute bg-white/50 rounded-full pointer-events-none"
                                        style={{
                                            left: ripple.x,
                                            top: ripple.y,
                                            width: ripple.size,
                                            height: ripple.size,
                                            marginLeft: -ripple.size / 2,
                                            marginTop: -ripple.size / 2,
                                        }}
                                    />
                                ))}
                            </AnimatePresence>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveQA(BEST_PRACTICES_ITEM);
                                }}
                                className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-full transition-all cursor-pointer active:scale-95 z-10 mr-1"
                                title="Best Practices"
                            >
                                <FontAwesomeIcon icon={faQuestion} className="text-sm" />
                            </button>

                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask something..."
                                disabled={isLoading && messages.some(m => m.content === "collecting")}
                                className="flex-1 bg-transparent border-none outline-none px-3 py-3 text-white placeholder:text-white/40 text-base md:text-lg min-w-0 font-medium z-10"
                                autoComplete="off"
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    arrowUpRef.current?.startAnimation();
                                    handleSend();
                                }}
                                disabled={!inputValue.trim() || (isLoading && messages.some(m => m.content === "collecting"))}
                                className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-white hover:bg-gray-100 text-[#0098EA] rounded-full active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 shadow-lg cursor-pointer z-10"
                            >
                                <ArrowUpIcon ref={arrowUpRef} size={22} />
                            </button>
                        </div>
                    </div>
                </div>
                <span className="flex justify-center text-white/50 text-xs font-medium mb-6">Tonpixo can make mistakes. Verify important information.</span>
            </div>

            {/* Q&A Bottom Sheet Modal */}
            <AnimatePresence>
                {activeQA && (
                    <QABottomSheet
                        item={activeQA}
                        onClose={() => setActiveQA(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading...</div>}>
            <ChatContent />
        </Suspense>
    )
}
