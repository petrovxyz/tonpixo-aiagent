"use client"

import { useState, useEffect, useRef, Suspense, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCheckCircle, faSpinner, faArrowUp, faArrowLeft, faGear, faExternalLinkAlt, faClockRotateLeft, faWallet, faObjectGroup, faThumbsUp, faThumbsDown, faCopy, faStar as faStarSolid, faQuestion } from "@fortawesome/free-solid-svg-icons"
import { faStar as faStarOutline } from "@fortawesome/free-regular-svg-icons"
import axios from "axios"
import { Header } from "@/components/Header"
import { MarkdownRenderer, AnimatedText } from "@/components/MarkdownRenderer"
import { QABottomSheet, QAItem } from "@/components/QABottomSheet"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/context/TelegramContext"
import { useToast } from "@/components/Toast"

// Global lock to prevent duplicate address processing across component remounts
let globalProcessingAddress: string | null = null
let globalPendingChatId: string | null = null
let globalPendingMessages: Message[] | null = null

const BEST_PRACTICES_ITEM: QAItem = {
    id: 'best-practices',
    question: "Best practices",
    answer: "The more specific your prompt, the better the result. Always define clear timeframes, explicitly name the assets you are tracking, and state your desired format. Avoid vague questions. Instead, combine dates, actions, and filters to get desired insights.",
    image: "/images/banner_best_practices.webp"
}

// Message Type Definition
interface Message {
    id: string
    role: "user" | "agent"
    content: React.ReactNode
    timestamp: Date
    isStreaming?: boolean
    streamingText?: string  // Track the actual text being streamed
    thinkingText?: string   // Track agent's thinking/reasoning before answer
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
}) => {
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

    return (
        <button
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
                onClick();
            }}
            className={cn(
                "relative flex items-center justify-center gap-1.5 font-medium transition-all active:scale-[0.98] cursor-pointer overflow-hidden",
                variant === "primary" && "w-full px-4 py-3 rounded-xl bg-[#0098EA] text-white hover:bg-[#0088CC] text-[14px]",
                variant === "icon_user" && "mx-2 p-1.5 rounded-full text-gray-700 bg-black/5 hover:bg-black/10 text-sm",
                variant === "icon_agent" && "mx-2 p-1.5 rounded-full text-white bg-white/10 hover:bg-white/15 text-sm",
                className
            )}
        >
            <AnimatePresence>
                {ripples.map((ripple) => (
                    <motion.span
                        key={ripple.id}
                        initial={{ scale: 0, opacity: 0.35 }}
                        animate={{ scale: 4, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
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
            <span className="relative z-10 flex items-center gap-1.5">
                {icon}
                {children}
            </span>
        </button>
    )
}

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

// Tonviewer icon SVG component
const TonviewerIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 40 40">
        <path fill="#89B8FF" d="m11 20 9-14 9 14-9 14z"></path>
        <path fill="#2E5FDC" d="M20 34V20h-7z"></path>
        <path fill="#1D2DC6" d="M20 34V20h7z"></path>
        <path fill="#4576F3" d="M20 20V6l-7 14z"></path>
        <path fill="#3346F6" d="M20 20V6l7 14z"></path>
        <path fill="#4486EB" d="M20 34 8 20h6z"></path>
        <path fill="#89B8FF" d="M8 20 20 6l-6 14z"></path>
        <path fill="#0F1D9D" d="M32 20 20 34l6-14z"></path>
        <path fill="#213DD1" d="m20 6 12 14h-6z"></path>
    </svg>
)

// Interface for stored address details
interface AddressDetailsData {
    type: 'address_details'
    address: string
    rawAddress?: string
    status?: string
    isWallet?: boolean
    interfaces?: string[]
    lastActivity?: string
    balance?: string
    isScam?: boolean
    hasError?: boolean
}

// Component to render address details message (works for both live and loaded from history)
const AddressDetailsMessage = ({ data, animate = false }: { data: AddressDetailsData; animate?: boolean }) => {
    const TextWrapper = animate ? AnimatedText : ({ children }: { children: React.ReactNode }) => <>{children}</>

    return (
        <div className="flex flex-col gap-4">
            {!data.hasError && data.rawAddress && (
                <div className="text-white space-y-2 text-sm bg-black/10 p-4 rounded-xl">
                    <h3 className="font-bold text-white mb-2 text-base">Address details</h3>
                    <div className="flex flex-col gap-2">
                        <span className="text-white"><span className="font-semibold">Raw address:</span> <span className="font-mono text-xs break-all">{data.rawAddress}</span></span>
                        <span className="text-white"><span className="font-semibold">Status:</span> {data.status}</span>
                        <span className="text-white"><span className="font-semibold">Is wallet:</span> {data.isWallet ? "yes" : "no"}</span>
                        <span className="text-white"><span className="font-semibold">Interfaces:</span> {data.interfaces?.join(", ") || "none"}</span>
                        <span className="text-white"><span className="font-semibold">Last activity:</span> {data.lastActivity} UTC</span>
                        <span className="text-white"><span className="font-semibold">Balance:</span> {data.balance} TON</span>
                        <span className="text-white"><span className="font-semibold">Is scam:</span> {data.isScam ? "yes" : "no"}</span>
                    </div>
                </div>
            )}

            <p className="text-white">
                <TextWrapper isAgent={true}>
                    Got it! I've received the address. You can explore it by yourself on:
                </TextWrapper>
            </p>
            <ExplorerLink
                href={`https://tonviewer.com/${data.address}`}
                icon={<TonviewerIcon />}
            >
                Tonviewer
            </ExplorerLink>
        </div>
    )
}

// Helper to parse stored message content and reconstruct JSX if needed
// Returns both the content and whether it's a system message
const parseStoredMessage = (content: string): { content: React.ReactNode; isSystemMessage: boolean } => {
    try {
        // Try to parse as JSON first
        if (content.startsWith('{') && content.includes('"type"')) {
            const parsed = JSON.parse(content)
            if (parsed.type === 'address_details') {
                // Address details messages are system messages (no like/dislike/copy)
                return {
                    content: <AddressDetailsMessage data={parsed} animate={false} />,
                    isSystemMessage: true
                }
            }
        }
    } catch {
        // Not JSON, return as-is (will be rendered as markdown)
    }
    return { content, isSystemMessage: false }
}

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
                    <div className="break-words [overflow-wrap:break-word]">
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
    isSystemMessage = false,
    thinkingText
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
    thinkingText?: string
}) => {
    const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null)
    const [showThinking, setShowThinking] = useState(false)

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
                    <Image src="/logo.svg" alt="Agent" width={24} height={24} className="object-contain" />
                </div>
            )}
            {role === "user" && (
                <div className="relative w-10 h-10 rounded-full bg-white/20 border border-white/30 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-lg">
                    {userPhotoUrl ? (
                        <Image src={userPhotoUrl} alt="User" fill className="object-cover" unoptimized />
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
                {/* Collapsible Thinking Section */}
                {role === "agent" && thinkingText && (
                    <div className="mb-3">
                        <button
                            onClick={() => setShowThinking(!showThinking)}
                            className="flex items-center gap-2 text-xs text-white/60 hover:text-white/80 transition-colors"
                        >
                            <motion.span
                                animate={{ rotate: showThinking ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                    <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                </svg>
                            </motion.span>
                            <span>Thinking</span>
                        </button>
                        <AnimatePresence>
                            {showThinking && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-2 pl-4 border-l-2 border-white/20 text-sm text-white/60 italic">
                                        {thinkingText}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
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
                    className="break-words [overflow-wrap:break-word]"
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
                                            className={cn(feedbackGiven === 1 && "bg-white/30 border border-white/50")}
                                        >
                                            <FontAwesomeIcon icon={faThumbsUp} />
                                        </ActionButton>
                                        <ActionButton
                                            variant="icon_agent"
                                            onClick={() => handleFeedback(0)}
                                            className={cn(feedbackGiven === 0 && "bg-white/30 border border-white/50")}
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
    const chatIdParam = searchParams.get("chat_id")

    const { isMobile, user } = useTelegram()
    const { showToast } = useToast()

    const [messages, setMessages] = useState<Array<Message>>([])
    const [inputValue, setInputValue] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [count, setCount] = useState<number>(0)
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])
    const [jobId, setJobId] = useState<string | null>(null)
    const [chatId, setChatId] = useState<string | null>(null)
    const [streamingContent, setStreamingContent] = useState("")
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [pendingAddress, setPendingAddress] = useState<string | null>(null)
    const [currentScanType, setCurrentScanType] = useState<string | null>(null)
    const [isFavourite, setIsFavourite] = useState(false)
    const [currentAddress, setCurrentAddress] = useState<string | null>(null)
    const [awaitingTransactionLimit, setAwaitingTransactionLimit] = useState(false)
    const [activeQA, setActiveQA] = useState<QAItem | null>(null)

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const hasStartedRef = useRef(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const streamingMsgIdRef = useRef<string | null>(null)
    const userRef = useRef(user)
    const activeSessionRef = useRef(false) // Track if messages were added during this session
    const chatIdRef = useRef<string | null>(chatIdParam) // Initialize from URL param immediately
    const prevChatIdParamRef = useRef<string | null>(chatIdParam) // Track URL parameter changes
    const historyLoadedRef = useRef<string | null>(null) // Track if history has been loaded
    const activeJobIdRef = useRef<string | null>(null) // Ref to track the currently active job for cleanup

    useEffect(() => {
        userRef.current = user
    }, [user])

    // Keep chatIdRef in sync with chatId state and URL parameter
    useEffect(() => {
        chatIdRef.current = chatId
    }, [chatId])

    // CRITICAL: Sync chatIdRef immediately when URL parameter changes
    // This must happen synchronously before any other effects that might call ensureChatId
    if (chatIdParam && chatIdParam !== prevChatIdParamRef.current) {
        // Special case: If we already recovered the ID (e.g. from window fallback) and started a session,
        // we should not reset the session or trigger a history overwrite.
        if ((chatIdRef.current === chatIdParam && activeSessionRef.current) || globalPendingChatId === chatIdParam) {
            console.log(`[CHAT-ID] URL param caught up to recovered ID ${chatIdParam}, preserving active session`)
            prevChatIdParamRef.current = chatIdParam

            // Ensure session is marked active if matched via globalPendingChatId
            if (globalPendingChatId === chatIdParam) {
                activeSessionRef.current = true
                if (!chatIdRef.current) chatIdRef.current = chatIdParam
            }

            // Prevent loadHistory from running and overwriting the active session
            if (historyLoadedRef.current !== chatIdParam) {
                historyLoadedRef.current = chatIdParam
            }
        } else {
            console.log(`[CHAT-ID] URL param changed from ${prevChatIdParamRef.current} to ${chatIdParam}, syncing ref immediately`)
            chatIdRef.current = chatIdParam
            prevChatIdParamRef.current = chatIdParam
            // Reset all session tracking refs when navigating to a different chat
            activeSessionRef.current = false
            hasStartedRef.current = false
            // Reset historyLoadedRef if navigating to a DIFFERENT chat (not the same one)
            if (historyLoadedRef.current !== chatIdParam) {
                historyLoadedRef.current = null
            }
        }
    } else if (!chatIdParam && prevChatIdParamRef.current) {
        // Navigating away from an existing chat to new chat
        console.log(`[CHAT-ID] URL param cleared, resetting for new chat`)
        prevChatIdParamRef.current = null
        chatIdRef.current = null // Clear ref so new ID will be created
        activeSessionRef.current = false
        hasStartedRef.current = false
        historyLoadedRef.current = null

        // Reset Chat State
        setJobId(null)
        activeJobIdRef.current = null
        setMessages([])
        setIsFavourite(false)
        setPendingAddress(null)
        setCurrentAddress(null)
    }

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, streamingContent])



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

    // Check favourite status when address changes
    useEffect(() => {
        const checkFavourite = async () => {
            const addressToCheck = currentAddress || pendingAddress || addressParam
            if (!addressToCheck || !user?.id) {
                setIsFavourite(false)
                return
            }

            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
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

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

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


    // Load Chat History
    useEffect(() => {
        const loadHistory = async () => {
            if (!chatIdParam) {
                return
            }

            // If we have an addressParam AND we have pending global messages for this chat,
            // we skip loading history to use the fresh in-memory state.
            // Otherwise (e.g. refresh, or old chat with address param), we should load history.
            if (addressParam && globalPendingChatId === chatIdParam) {
                console.log(`[CHAT] Skipping history load - using pending in-memory state`)
                historyLoadedRef.current = chatIdParam
                chatIdRef.current = chatIdParam
                return
            }

            // Prevent duplicate loading for the same chat
            if (historyLoadedRef.current === chatIdParam) {
                console.log(`[CHAT] History already loaded for chat ${chatIdParam}, skipping`)
                // Ensure ref is in sync even when skipping
                if (!chatIdRef.current) chatIdRef.current = chatIdParam
                return
            }

            // If this is an active session where messages were added, don't overwrite them
            if (activeSessionRef.current) {
                console.log(`[CHAT] Skipping history load - active session in progress`)
                historyLoadedRef.current = chatIdParam
                // Even when skipping, ensure ref is in sync with URL param
                if (!chatIdRef.current) {
                    chatIdRef.current = chatIdParam
                    console.log(`[CHAT] Synced chatIdRef to URL param: ${chatIdParam}`)
                }
                return
            }

            // Wait for user to be authenticated to verify ownership
            if (!user) return

            console.log(`[CHAT] Loading history for chat ${chatIdParam}`)
            historyLoadedRef.current = chatIdParam
            setChatId(chatIdParam)
            chatIdRef.current = chatIdParam // CRITICAL: Also set the ref to prevent new ID creation!
            setIsLoading(true)

            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

                // 1. Get Metadata to restore job_id
                const metaResponse = await axios.get(`${apiUrl}/api/chat/${chatIdParam}`, {
                    params: { user_id: user.id }
                })

                if (metaResponse.data.error) {
                    throw new Error(metaResponse.data.error)
                }

                if (metaResponse.data && !metaResponse.data.error) {
                    if (metaResponse.data.job_id) {
                        setJobId(metaResponse.data.job_id)
                        activeJobIdRef.current = metaResponse.data.job_id
                    }
                    // Set address from metadata so star button works
                    if (metaResponse.data.address) {
                        setCurrentAddress(metaResponse.data.address)
                    }
                }

                // 2. Get Messages
                const historyResponse = await axios.get(`${apiUrl}/api/chat/${chatIdParam}/history`, {
                    params: { user_id: user.id }
                })

                if (historyResponse.data.error) {
                    throw new Error(historyResponse.data.error)
                }

                if (historyResponse.data.messages) {
                    const loadedMessages = historyResponse.data.messages.map((msg: { message_id?: string, role: "user" | "agent", content: string, created_at: string, trace_id?: string }) => {
                        const parsed = parseStoredMessage(msg.content)
                        return {
                            id: msg.message_id || Math.random().toString(36),
                            role: msg.role,
                            content: parsed.content,
                            timestamp: new Date(msg.created_at),
                            traceId: msg.trace_id,
                            isSystemMessage: parsed.isSystemMessage
                        }
                    })
                    console.log(`[CHAT] Loaded ${loadedMessages.length} messages from history`)
                    setMessages(loadedMessages)
                }

            } catch (error) {
                console.error("Failed to load history:", error)
                historyLoadedRef.current = null // Reset so it can retry
                const errorMsg = (error as any).response?.data?.error || (error as any).response?.data?.detail || (error as any).message || "Unknown error"

                if (errorMsg.includes("Access denied")) {
                    showToast("Access denied: you cannot view this chat", "error")
                    // Redirect to explore after a delay
                    setTimeout(() => router.push('/explore'), 2000)
                } else {
                    showToast("Failed to load chat history", "error")
                }
            } finally {
                setIsLoading(false)
            }
        }

        loadHistory()
    }, [chatIdParam, user])

    // Generate Chat ID if needed when starting interaction
    const ensureChatId = () => {
        // Use ref to get the latest value, avoiding stale closures
        if (chatIdRef.current) {
            console.log(`[CHAT-ID] Returning existing chatId: ${chatIdRef.current}`)
            return chatIdRef.current
        }

        // Fallback: Check if URL actually has an ID (client-side only check)
        // This handles cases where useSearchParams() or routing is lagging behind the actual URL
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search)
            const urlId = urlParams.get('chat_id')
            if (urlId) {
                console.log(`[CHAT-ID] Recovered ID from existing URL: ${urlId}`)
                chatIdRef.current = urlId
                setChatId(urlId)
                return urlId
            }
        }

        const newId = crypto.randomUUID()
        console.log(`[CHAT-ID] Creating NEW chatId: ${newId}`)
        console.trace('[CHAT-ID] Stack trace for new ID creation')
        setChatId(newId)
        chatIdRef.current = newId // Update ref immediately
        globalPendingChatId = newId // Set global immediately to prevent race conditions during URL update
        // Update URL without reload
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('chat_id', newId)
        window.history.pushState({}, '', newUrl.toString())
        return newId
    }

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
    const pollStatus = async (jobId: string, scanType: string, targetAddress: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.get(`${apiUrl}/api/status/${jobId}`)
            const data = response.data

            if (data.status === "processing" || data.status === "queued") {
                setCount(data.count || 0)
                setTimeout(() => pollStatus(jobId, scanType, targetAddress), 1000)
            } else if (data.status === "success") {
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

                        // 2. Save Agent Message (analysis complete)
                        await axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                            role: "agent",
                            content: agentMarkdown
                        })

                        // Update chat with job_id (without re-initializing)
                        await axios.post(`${apiUrl}/api/chat/init`, {
                            chat_id: currentChatId,
                            user_id: userRef.current.id,
                            job_id: jobId,
                            address: targetAddress
                        })

                    } catch (e) {
                        console.error("Failed to save messages:", e)
                    }
                }


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
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.post(`${apiUrl}/api/generate`, {
                address: targetAddress,
                scan_type: scanType,
                limit: limit
            })

            if (response.data.job_id) {
                activeJobIdRef.current = response.data.job_id  // Track active job for cleanup
                pollStatus(response.data.job_id, scanType, targetAddress)
            }
        } catch (err) {
            removeLoadingMessage()
            addMessage("agent", (err as any).response?.data?.detail || "Failed to start generation.", false, undefined, true)
            setIsLoading(false)
        }
    }

    // Handle address detection and show acknowledgment
    const handleAddressReceived = async (address: string) => {
        if (globalProcessingAddress === address) return
        globalProcessingAddress = address

        // Mark session as active to prevent history load from overwriting initial state
        activeSessionRef.current = true

        setPendingAddress(address)
        setCurrentAddress(address)

        // Show loading state for wallet info
        const loadingId = Math.random().toString(36).substr(2, 9)
        setMessages(prev => [...prev, {
            id: loadingId,
            role: "agent",
            content: (
                <div className="flex items-center gap-2 text-white/80">
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                    <span>Fetching account details...</span>
                </div>
            ),
            timestamp: new Date(),
            isSystemMessage: true
        }])

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.post(`${apiUrl}/api/account_summary`, { address })

            // Remove loading message
            setMessages(prev => prev.filter(m => m.id !== loadingId))

            if (response.data.error) {
                // Fallback if error
                addMessage("agent", (
                    <AddressDetailsMessage
                        data={{
                            type: 'address_details',
                            address: address,
                            hasError: true
                        }}
                        animate={true}
                    />
                ), false, undefined, true)
            } else {
                const data = response.data
                const lastActivity = new Date(data.last_activity * 1000).toUTCString().replace(' GMT', '');
                const balance = (data.balance / 1000000000).toFixed(2)

                addMessage("agent", (
                    <AddressDetailsMessage
                        data={{
                            type: 'address_details',
                            address: address,
                            rawAddress: data.address,
                            status: data.status,
                            isWallet: data.is_wallet,
                            interfaces: data.interfaces,
                            lastActivity: lastActivity,
                            balance: balance,
                            isScam: data.is_scam,
                            hasError: false
                        }}
                        animate={true}
                    />
                ), false, undefined, true)

                // Save to backend for history - use centralized chat ID management
                const currentChatId = ensureChatId()

                // Save state globally to survive potential component remounts updates
                globalPendingChatId = currentChatId

                // Construct the result message for global storage
                const resultMessage = {
                    id: (Date.now() + 1).toString(),
                    role: "agent" as const, // Explicitly type as "agent"
                    content: (
                        <AddressDetailsMessage
                            data={{
                                type: 'address_details',
                                address: address,
                                rawAddress: data.address,
                                status: data.status,
                                isWallet: data.is_wallet,
                                interfaces: data.interfaces,
                                lastActivity: lastActivity,
                                balance: balance,
                                isScam: data.is_scam,
                                hasError: false
                            }}
                            animate={true}
                        />
                    ),
                    timestamp: new Date(),
                    isSystemMessage: true
                }

                console.log(`[CHAT] Constructing globalPendingMessages with 2 items`)
                globalPendingMessages = [
                    ...messages.filter(m => m.id !== loadingId), // Remove loading message from history
                    {
                        id: Date.now().toString(),
                        role: "user" as const,
                        content: `Address: ${address}`,
                        timestamp: new Date()
                    },
                    resultMessage
                ]

                if (userRef.current) {
                    try {
                        // Reconstruct data object for backend storage
                        const addressDetailsJson: AddressDetailsData = {
                            type: 'address_details',
                            address: address,
                            rawAddress: data.address,
                            status: data.status,
                            isWallet: data.is_wallet,
                            interfaces: data.interfaces,
                            lastActivity: lastActivity,
                            balance: balance,
                            isScam: data.is_scam,
                            hasError: !!data.error
                        }

                        // 1. Init chat
                        await axios.post(`${apiUrl}/api/chat/init`, {
                            chat_id: currentChatId,
                            user_id: userRef.current.id,
                            title: `Address: ${address.slice(0, 8)}...${address.slice(-6)}`,
                            address: address
                        })

                        // 2. Save user message (the address they entered)
                        // Note: Backend expects "Address: " or "Search: " - consistent with UI
                        await axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                            role: "user",
                            content: `Search: ${address}`
                        })

                        // 3. Save agent response as JSON
                        await axios.post(`${apiUrl}/api/chat/${currentChatId}/message`, {
                            role: "agent",
                            content: JSON.stringify(addressDetailsJson)
                        })
                    } catch (e) {
                        console.error("Failed to save address details to history:", e)
                    }
                }
            }
        } catch (_) {
            // Remove loading message
            setMessages(prev => prev.filter(m => m.id !== loadingId))
            // Fallback (same as error above)
            addMessage("agent", (
                <AddressDetailsMessage
                    data={{
                        type: 'address_details',
                        address: address,
                        hasError: true
                    }}
                    animate={true}
                />
            ), false, undefined, true)
        }

        // After a short delay, show scan type selection
        setTimeout(() => {
            showScanTypeSelection(address)
            // Reset global lock after standard delay to allow reprocessing if needed later
            globalProcessingAddress = null
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

        // If user selected Transactions, ask for limit preference
        if (scanType === 'transactions') {
            addMessage("user", "Scan Transactions")

            // Save this interaction to backend so it persists
            const currentChatId = chatIdRef.current
            if (currentChatId) {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
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
                                        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
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



    const addMessage = (role: "user" | "agent", content: React.ReactNode, isStreaming = false, traceId?: string, isSystemMessage = false) => {
        // Mark that we're in an active session to prevent loadHistory from overwriting
        activeSessionRef.current = true
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
            } catch (_) {
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
        // Skip if we're loading an existing chat from history
        // The loadHistory effect will handle setting up messages, and
        // chatIdRef is now synced synchronously at the top of the component
        if (chatIdParam) {
            hasStartedRef.current = true

            // Check if we need to restore state after URL update for new chat (handles remounts)
            if (globalPendingChatId === chatIdParam && globalPendingMessages) {
                const lastMsg = globalPendingMessages[globalPendingMessages.length - 1]
                // Check if the content is our result component
                // @ts-expect-error - accessing internal react element type
                const isResult = lastMsg?.content?.type === AddressDetailsMessage

                if (isResult) {
                    console.log(`[CHAT] Restoring finished result for ${chatIdParam}. Items: ${globalPendingMessages.length}`)
                    setMessages(globalPendingMessages)
                    activeSessionRef.current = true
                    historyLoadedRef.current = chatIdParam

                    // Show scan options since we restored the result
                    if (addressParam) {
                        setTimeout(() => showScanTypeSelection(addressParam), 500)
                    }
                } else {
                    console.log(`[CHAT] Restoring interrupted fetch - restarting process`)
                    // The fetch was interrupted (e.g. component remounted while fetching),
                    // so we need to restart it safely
                    globalProcessingAddress = null
                    if (addressParam) {
                        handleAddressReceived(addressParam)
                    }
                }

                // Clear globals
                globalPendingChatId = null
                globalPendingMessages = null
            }
            return
        }

        // Fallback: Check if URL actually has an ID (client-side only check)
        // If an ID exists in the URL (even if useSearchParams is lagging), 
        // we treat this as a "History Mode" session and AVOID starting a new search/welcome flow.
        // This prevents duplicate execution of handleAddressReceived (double-saving) on remounts.
        let hasUrlId = false
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search)
            if (urlParams.get('chat_id')) hasUrlId = true
        }

        if (hasUrlId) {
            console.log("[CHAT] ID found in window.location, skipping initialization (waiting for chatIdParam)")
            hasStartedRef.current = true

            // Restore state from global backup if available (handles remounts)
            if (globalPendingChatId && globalPendingMessages) {
                // Check if the URL ID matches our pending ID
                const urlParams = new URLSearchParams(window.location.search)
                if (urlParams.get('chat_id') === globalPendingChatId) {
                    console.log("[CHAT] Restoring state from global pending storage after remount")
                    setMessages(globalPendingMessages)
                    chatIdRef.current = globalPendingChatId
                    activeSessionRef.current = true
                    historyLoadedRef.current = globalPendingChatId
                    // Clear globals
                    globalPendingChatId = null
                    globalPendingMessages = null
                }
            }
            return
        }

        if (addressParam && !hasStartedRef.current) {
            hasStartedRef.current = true
            addMessage("user", `Search: ${addressParam}`)
            // Use new flow for URL parameter too
            handleAddressReceived(addressParam)
        } else if (!hasStartedRef.current) {
            hasStartedRef.current = true
            addMessage("agent", "Welcome! Share a TON wallet address to start the analysis.", false, undefined, true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addressParam, chatIdParam])

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
                            <FontAwesomeIcon icon={isFavourite ? faStarSolid : faStarOutline} className="text-xl" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Input Area */}
            <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
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
                                    handleSend();
                                }}
                                disabled={!inputValue.trim() || (isLoading && messages.some(m => m.content === "collecting"))}
                                className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-white hover:bg-gray-100 text-[#0098EA] rounded-full active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 shadow-lg cursor-pointer z-10"
                            >
                                <FontAwesomeIcon icon={faArrowUp} className="text-xl" />
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

