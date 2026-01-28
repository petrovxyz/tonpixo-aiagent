"use client"

import { useState, useEffect, useRef, Suspense, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCheckCircle, faSpinner, faArrowUp, faArrowLeft, faGear, faExternalLinkAlt, faClockRotateLeft, faWallet, faObjectGroup, faThumbsUp, faThumbsDown, faCopy } from "@fortawesome/free-solid-svg-icons"
import axios from "axios"
import { Header } from "@/components/Header"
import { MarkdownRenderer, AnimatedText } from "@/components/MarkdownRenderer"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/context/TelegramContext"
import { useToast } from "@/components/Toast"

// Message Type Definition
interface Message {
    id: string
    role: "user" | "agent"
    content: React.ReactNode
    timestamp: Date
    isStreaming?: boolean
    streamingText?: string  // Track the actual text being streamed
    isAnalyzing?: boolean   // Track if agent is using tools
    traceId?: string        // Langfuse trace ID for feedback
    isSystemMessage?: boolean // Flag for system messages (no actions)
}


// Action Button Component for clickable buttons in messages
const ActionButton = ({
    children,
    onClick,
    icon,
    variant = "primary",
    className
}: {
    children: React.ReactNode
    onClick: () => void
    icon?: React.ReactNode
    variant?: "primary" | "secondary" | "link" | "icon_user" | "icon_agent"
    className?: string
}) => (
    <button
        onClick={onClick}
        className={cn(
            "flex items-center justify-center gap-1.5 font-medium transition-all active:scale-[0.98] cursor-pointer",
            variant === "primary" && "w-full px-4 py-3 rounded-xl bg-[#0098EA] text-white hover:bg-[#0088CC] text-[14px]",
            variant === "icon_user" && "mx-2 p-1.5 rounded-full text-gray-700 bg-black/5 hover:bg-black/10 text-sm",
            variant === "icon_agent" && "mx-2 p-1.5 rounded-full text-white bg-white/10 hover:bg-white/15 text-sm",
            className
        )}
    >
        {icon}
        {children}
    </button>
)

// Explorer Link Button - opens in new tab
const ExplorerLink = ({
    href,
    children,
    icon
}: {
    href: string
    children: React.ReactNode
    icon?: React.ReactNode
}) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full bg-[#0098EA] hover:bg-[#0088CC] text-[14px] flex items-center justify-center gap-1 px-4 py-3 rounded-xl font-medium transition-all text-white active:scale-[0.98]"
    >
        {icon}
        {children}
        <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs opacity-70" />
    </a>
)

// Streaming message component that shows tokens as they arrive
const StreamingMessage = ({
    content,
    isThinking
}: {
    content: string
    isThinking: boolean
}) => {
    const showThinkingIndicator = isThinking || !content

    return (
        <div className="flex flex-col gap-2">
            {showThinkingIndicator && !content && (
                <div className="flex items-center gap-2 text-white/60">
                    <FontAwesomeIcon icon={faGear} className="animate-spin text-sm" />
                    <span className="italic animate-pulse">
                        {isThinking ? "Analyzing data..." : "Thinking..."}
                    </span>
                </div>
            )}
            {content && (
                <>
                    {isThinking && (
                        <div className="flex items-center gap-2 text-white/60 text-sm">
                            <FontAwesomeIcon icon={faGear} className="animate-spin text-xs" />
                            <span className="italic">Analyzing data...</span>
                        </div>
                    )}
                    <div className="break-words [overflow-wrap:break-word] [word-break:keep-all]">
                        <MarkdownRenderer content={content} isUserMessage={false} isStreaming={true} />
                        <span className="animate-pulse">▊</span>
                    </div>
                </>
            )}
        </div>
    )
}

const MessageBubble = ({
    role,
    content,
    timestamp,
    isStreaming = false,
    userPhotoUrl,
    traceId,
    onFeedback,
    onCopy,
    isSystemMessage = false
}: {
    role: "user" | "agent"
    content: React.ReactNode
    timestamp: Date
    isStreaming?: boolean
    userPhotoUrl?: string | null
    traceId?: string
    onFeedback?: (score: number, traceId: string) => void
    onCopy?: (text: string) => void
    isSystemMessage?: boolean
}) => {
    const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null)

    const handleFeedback = (score: number) => {
        if (feedbackGiven !== null) return
        setFeedbackGiven(score)
        if (onFeedback) {
            // Always call onFeedback - let parent handle missing traceId
            onFeedback(score, traceId || '')
        }
    }

    // Extract text content for copy purposes
    const getTextContent = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node
        if (Array.isArray(node)) return node.map(getTextContent).join('')
        return ''
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
                "flex w-full mb-4 px-4 gap-3 max-w-[90%] items-end",
                role === "user" ? "flex-row-reverse ml-auto" : "flex-row"
            )}
        >
            {role === "agent" && (
                <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-lg">
                    <img src="/logo.svg" alt="Agent" className="w-6 h-6 object-contain" />
                </div>
            )}
            {role === "user" && (
                <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-lg">
                    {userPhotoUrl ? (
                        <img src={userPhotoUrl} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#4FC3F7] to-[#0098EA] flex items-center justify-center text-white font-bold text-sm">
                            U
                        </div>
                    )}
                </div>
            )}
            <div className={cn(
                "relative max-w-[85%] md:max-w-[75%] px-5 py-4 text-[16px] font-medium leading-relaxed shadow-lg transition-all",
                role === "user"
                    ? "bg-white text-gray-900 rounded-3xl rounded-br-sm"
                    : "bg-[#0098EA]/20 border border-white/20 text-white rounded-3xl rounded-bl-sm ring-1 ring-white/5",
                isStreaming && "min-h-[60px]"
            )}>
                <motion.div
                    initial={role === "agent" && !isStreaming ? "hidden" : "visible"}
                    animate="visible"
                    variants={{
                        visible: {
                            transition: {
                                staggerChildren: 0.03,
                                delayChildren: 0.1
                            }
                        }
                    }}
                    className="break-words [overflow-wrap:break-word] [word-break:keep-all]"
                >
                    {typeof content === 'string' ? (
                        <MarkdownRenderer content={content} isUserMessage={role === 'user'} isStreaming={isStreaming} />
                    ) : (
                        content
                    )}
                </motion.div>
                {!isStreaming && (
                    <div className="flex items-center justify-between mt-4">
                        <div className={cn(
                            "text-[10px] opacity-70 font-bold tracking-tight mt-1",
                            role === "user" ? "text-right text-gray-400" : "text-left text-white/70"
                        )}>
                            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        {/* Feedback and Actions - Only show if NOT a system message */}
                        {!isSystemMessage && (
                            <div className="flex items-center gap-1">
                                {role === "agent" && (
                                    <>
                                        <ActionButton
                                            variant="icon_agent"
                                            onClick={() => handleFeedback(1)}
                                            className={cn(feedbackGiven === 1 && "bg-white/20")}
                                        >
                                            <FontAwesomeIcon icon={faThumbsUp} />
                                        </ActionButton>
                                        <ActionButton
                                            variant="icon_agent"
                                            onClick={() => handleFeedback(0)}
                                            className={cn(feedbackGiven === 0 && "bg-white/20")}
                                        >
                                            <FontAwesomeIcon icon={faThumbsDown} />
                                        </ActionButton>
                                    </>
                                )}
                                {/* Copy Button */}
                                <ActionButton
                                    variant={role === "user" ? "icon_user" : "icon_agent"}
                                    onClick={() => onCopy?.(typeof content === 'string' ? content : getTextContent(content))}
                                >
                                    <FontAwesomeIcon icon={faCopy} />
                                </ActionButton>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    )
}


function ChatContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const addressParam = searchParams.get("address")

    const { isMobile, user } = useTelegram()
    const { showToast } = useToast()

    const [messages, setMessages] = useState<Array<Message>>([])
    const [inputValue, setInputValue] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [count, setCount] = useState<number>(0)
    const [jobId, setJobId] = useState<string | null>(null)
    const [streamingContent, setStreamingContent] = useState("")
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [pendingAddress, setPendingAddress] = useState<string | null>(null)
    const [currentScanType, setCurrentScanType] = useState<string | null>(null)

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const hasStartedRef = useRef(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const streamingMsgIdRef = useRef<string | null>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, streamingContent])

    // Ref to track the currently active job for cleanup
    const activeJobIdRef = useRef<string | null>(null)

    // Cancel job function
    const cancelJob = async (jobIdToCancel: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
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
            }
            // Cancel any in-progress job when leaving chat
            if (activeJobIdRef.current) {
                cancelJob(activeJobIdRef.current)
            }
        }
    }, [])

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
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
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
    const pollStatus = async (jobId: string, scanType: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.get(`${apiUrl}/api/status/${jobId}`)
            const data = response.data

            if (data.status === "processing" || data.status === "queued") {
                setCount(data.count || 0)
                setTimeout(() => pollStatus(jobId, scanType), 1000)
            } else if (data.status === "success") {
                setIsLoading(false)
                setJobId(jobId)
                addMessage("agent", (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center font-bold text-white gap-1">
                            <FontAwesomeIcon icon={faCheckCircle} />
                            <span><AnimatedText isAgent={true}>Analysis complete</AnimatedText></span>
                        </div>
                        <p className="text-white/90">
                            <AnimatedText isAgent={true}>
                                I'm done! {data.count} {getScanTypeLabel(scanType)} have been scanned and I'm ready for your questions.
                            </AnimatedText>
                        </p>
                    </div>
                ), false, undefined, true)
                removeLoadingMessage()
                activeJobIdRef.current = null  // Job completed, clear active job
            } else if (data.status === "empty") {
                setIsLoading(false)
                removeLoadingMessage()
                addMessage("agent", `I couldn't find any ${getScanTypeLabel(scanType)} for this address.`, false, undefined, true)
                activeJobIdRef.current = null  // Job completed, clear active job
            } else if (data.status === "error") {
                setIsLoading(false)
                removeLoadingMessage()
                addMessage("agent", `Error: ${data.error || "Failed to generate history"}`, false, undefined, true)
                activeJobIdRef.current = null  // Job completed, clear active job
            } else if (data.status === "cancelled") {
                setIsLoading(false)
                removeLoadingMessage()
                activeJobIdRef.current = null  // Job was cancelled
            }
        } catch (err) {
            setIsLoading(false)
            removeLoadingMessage()
            addMessage("agent", "Connection to background service lost.", false, undefined, true)
        }
    }

    const startSearch = async (targetAddress: string, scanType: string) => {
        setIsLoading(true)
        setCurrentScanType(scanType)
        setMessages(prev => [...prev.filter(m => m.content !== "collecting"), {
            id: "loading-state-" + Date.now(),
            role: "agent",
            content: "collecting",
            timestamp: new Date()
        }])

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.post(`${apiUrl}/api/generate`, {
                address: targetAddress,
                scan_type: scanType
            })

            if (response.data.job_id) {
                activeJobIdRef.current = response.data.job_id  // Track active job for cleanup
                pollStatus(response.data.job_id, scanType)
            }
        } catch (err: any) {
            removeLoadingMessage()
            addMessage("agent", err.response?.data?.detail || "Failed to start generation.", false, undefined, true)
            setIsLoading(false)
        }
    }

    // Handle address detection and show acknowledgment
    const handleAddressReceived = (address: string) => {
        setPendingAddress(address)

        // Show address acknowledgment with explorer links
        addMessage("agent", (
            <div className="flex flex-col gap-4">
                <p className="text-white">
                    <AnimatedText isAgent={true}>
                        Got it! I've received the address. You can explore it by yourself on:
                    </AnimatedText>
                </p>
                <motion.div variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}>
                    <ExplorerLink
                        href={`https://tonviewer.com/${address}`}
                        icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 40 40"><path fill="#89B8FF" d="m11 20 9-14 9 14-9 14z"></path><path fill="#2E5FDC" d="M20 34V20h-7z"></path><path fill="#1D2DC6" d="M20 34V20h7z"></path><path fill="#4576F3" d="M20 20V6l-7 14z"></path><path fill="#3346F6" d="M20 20V6l7 14z"></path><path fill="#4486EB" d="M20 34 8 20h6z"></path><path fill="#89B8FF" d="M8 20 20 6l-6 14z"></path><path fill="#0F1D9D" d="M32 20 20 34l6-14z"></path><path fill="#213DD1" d="m20 6 12 14h-6z"></path></svg>}
                    >
                        Tonviewer
                    </ExplorerLink>
                </motion.div>
            </div>
        ), false, undefined, true)

        // After a short delay, show scan type selection
        setTimeout(() => {
            showScanTypeSelection(address)
        }, 500)
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
        ), false, undefined, true)
    }

    // Handle scan type button click
    const handleScanTypeSelect = (address: string, scanType: string) => {
        const labels: Record<string, string> = {
            'transactions': 'Transactions',
            'jettons': 'Jettons',
            'nfts': 'NFTs'
        }
        addMessage("user", `Scan ${labels[scanType]}`)
        setPendingAddress(null)
        startSearch(address, scanType)
    }



    const addMessage = (role: "user" | "agent", content: React.ReactNode, isStreaming = false, traceId?: string, isSystemMessage = false) => {
        setMessages(prev => [
            ...prev.filter(m => m.content !== "collecting" && m.content !== "thinking"),
            {
                id: Math.random().toString(36).substr(2, 9),
                role,
                content,
                timestamp: new Date(),
                isStreaming,
                traceId,
                isSystemMessage
            }
        ])
    }

    const removeLoadingMessage = () => {
        setMessages(prev => prev.filter(m => m.content !== "collecting" && m.content !== "thinking"))
    }

    // Stream chat with SSE
    const streamChat = useCallback(async (question: string) => {
        // Use separate streaming URL for Lambda Function URL (supports SSE properly)
        // Falls back to regular API URL for local development
        const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

        console.log("[STREAM] Starting stream to:", streamUrl)
        console.log("[STREAM] API URL:", apiUrl)

        // Abort any existing stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        abortControllerRef.current = new AbortController()

        setIsLoading(true)
        setStreamingContent("")
        setIsAnalyzing(false)

        // Add a streaming message placeholder with thinking state
        const streamingMsgId = "streaming-" + Date.now()
        streamingMsgIdRef.current = streamingMsgId

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
                    question: question
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

                // Check if response is wrapped in Lambda proxy format (Mangum quirk)
                // This happens when Lambda Function URL returns a proxy response instead of raw streaming
                if (text.startsWith('{"statusCode":') || text.startsWith('{"statusCode":')) {
                    try {
                        const proxyResponse = JSON.parse(text)
                        if (proxyResponse.body) {
                            console.log("[STREAM] Detected Lambda proxy response, extracting body")
                            text = proxyResponse.body
                        }
                    } catch {
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
                                        ? { ...m, streamingText: accumulatedContent, isAnalyzing: currentlyAnalyzing }
                                        : m
                                ))
                            } else if (data.type === "tool_start") {
                                currentlyAnalyzing = true
                                setIsAnalyzing(true)
                                // Update message to show analyzing state
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, isAnalyzing: true }
                                        : m
                                ))
                            } else if (data.type === "tool_end") {
                                currentlyAnalyzing = false
                                setIsAnalyzing(false)
                                // Update message to hide analyzing state
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, isAnalyzing: false }
                                        : m
                                ))
                            } else if (data.type === "done") {
                                console.log("[STREAM] Got done event, finalizing with content length:", accumulatedContent.length)
                                // Finalize the message - preserve traceId
                                setMessages(prev => prev.map(m =>
                                    m.id === streamingMsgId
                                        ? { ...m, content: accumulatedContent, isStreaming: false, streamingText: undefined, isAnalyzing: false, timestamp: new Date(), traceId: m.traceId }
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

        } catch (err: any) {
            if (err.name === 'AbortError') {
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
            } catch (fallbackErr) {
                setMessages(prev => prev.filter(m => m.id !== streamingMsgId))
                addMessage("agent", "I encountered an error talking to the agent.")
            }
            streamingMsgIdRef.current = null
        } finally {
            setIsLoading(false)
            setStreamingContent("")
            setIsAnalyzing(false)
        }
    }, [jobId])

    const handleSend = async () => {
        if (!inputValue.trim()) return
        const text = inputValue.trim()
        setInputValue("")
        addMessage("user", text)

        if (!jobId) {
            // Check if it's an address
            if (text.length > 20 && (text.startsWith("EQ") || text.startsWith("UQ") || text.startsWith("0:"))) {
                // Don't start scanning immediately - show address acknowledgment first
                handleAddressReceived(text)
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

    useEffect(() => {
        if (addressParam && !hasStartedRef.current) {
            hasStartedRef.current = true
            addMessage("user", `Search: ${addressParam}`)
            // Use new flow for URL parameter too
            handleAddressReceived(addressParam)
        } else if (!hasStartedRef.current) {
            hasStartedRef.current = true
            addMessage("agent", "Welcome! Share a TON wallet address to start the analysis.", false, undefined, true)
        }
    }, [addressParam])

    return (
        <div className="relative w-full h-[100dvh] flex flex-col">
            {/* Main Scrollable Area */}
            <div className="flex-1 overflow-y-auto z-10 scroll-smooth scrollbar-hide">
                <div className="max-w-2xl mx-auto w-full min-h-full flex flex-col justify-end pt-38 pb-32">
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
                        <div className="w-14 h-14" />
                    </div>
                </div>
            </div>

            {/* Input Area */}
            <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
                {/* Backdrop */}
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#29B6F6]/80 via-[#29B6F6]/40 to-transparent -z-10" />


                <div className="max-w-2xl mx-auto w-full p-6 pb-10 md:pb-12 pointer-events-auto relative">

                    <div className="relative group">
                        <div className="absolute inset-0 rounded-full" />
                        <div className="relative bg-[#4FC3F7] border border-white/20 rounded-full p-2 flex items-center shadow-2xl transition-all ring-1 ring-white/10 inset-shadow-sm inset-shadow-white/30">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask something..."
                                disabled={isLoading && messages.some(m => m.content === "collecting")}
                                className="flex-1 bg-transparent border-none outline-none px-5 py-3.5 text-white placeholder:text-white/40 text-base md:text-lg min-w-0 font-medium"
                                autoComplete="off"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || (isLoading && messages.some(m => m.content === "collecting"))}
                                className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-white hover:bg-gray-100 text-[#0098EA] rounded-full active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 shadow-lg cursor-pointer"
                            >
                                <FontAwesomeIcon icon={faArrowUp} className="text-xl" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
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

