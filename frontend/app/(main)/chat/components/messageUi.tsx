"use client"

import { useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
    faGear,
    faExternalLinkAlt,
    faThumbsUp,
    faThumbsDown,
    faCopy
} from "@fortawesome/free-solid-svg-icons"
import { MarkdownRenderer, AnimatedText } from "@/components/MarkdownRenderer"
import { cn } from "@/lib/utils"
import { getAssetUrl } from "@/lib/assetsUrl"
import { LazyImage } from "@/components/LazyImage"
import type { AddressDetailsData } from "../types"

type ActionButtonVariant = "primary" | "secondary" | "link" | "icon_user" | "icon_agent"

interface ActionButtonProps {
    children: React.ReactNode
    onClick: () => void
    icon?: React.ReactNode
    variant?: ActionButtonVariant
    className?: string
}

export const ActionButton = ({
    children,
    onClick,
    icon,
    variant = "primary",
    className
}: ActionButtonProps) => {
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

    return (
        <button
            onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                const size = Math.max(rect.width, rect.height)

                const ripple = {
                    id: Date.now(),
                    x,
                    y,
                    size
                }

                setRipples((prev) => [...prev, ripple])
                onClick()
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
                            setRipples((prev) => prev.filter((r) => r.id !== ripple.id))
                        }}
                        className="absolute bg-white/50 rounded-full pointer-events-none"
                        style={{
                            left: ripple.x,
                            top: ripple.y,
                            width: ripple.size,
                            height: ripple.size,
                            marginLeft: -ripple.size / 2,
                            marginTop: -ripple.size / 2
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

const StaticTextWrapper = ({ children }: { children: React.ReactNode; isAgent: boolean; isStreaming?: boolean }) => (
    <>{children}</>
)

export const AddressDetailsMessage = ({ data, animate = false }: { data: AddressDetailsData; animate?: boolean }) => {
    const TextWrapper = animate ? AnimatedText : StaticTextWrapper

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
                    Got it! I&apos;ve received the address. You can explore it by yourself on:
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

export const parseStoredMessage = (content: string): { content: React.ReactNode; isSystemMessage: boolean } => {
    try {
        if (content.startsWith("{") && content.includes("\"type\"")) {
            const parsed = JSON.parse(content) as { type?: string }
            if (parsed.type === "address_details") {
                return {
                    content: <AddressDetailsMessage data={parsed as AddressDetailsData} animate={false} />,
                    isSystemMessage: true
                }
            }
        }
    } catch {
        // Not JSON, render as markdown in standard bubble.
    }
    return { content, isSystemMessage: false }
}

export const StreamingMessage = ({
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

interface MessageBubbleProps {
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
}

export const MessageBubble = ({
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
}: MessageBubbleProps) => {
    const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null)
    const [showThinking, setShowThinking] = useState(false)

    const handleFeedback = (score: number) => {
        if (feedbackGiven !== null) return
        setFeedbackGiven(score)
        if (onFeedback) {
            onFeedback(score, traceId || "")
        }
    }

    const getTextContent = (node: React.ReactNode): string => {
        if (typeof node === "string") return node
        if (Array.isArray(node)) return node.map(getTextContent).join("")
        return ""
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
                    <Image
                        src={getAssetUrl("logo.svg")}
                        alt="Agent"
                        width={28}
                        height={28}
                        style={{ width: "28px", height: "28px" }}
                        className="object-contain"
                        loading="lazy"
                        unoptimized
                    />
                </div>
            )}
            {role === "user" && (
                <div className="relative w-10 h-10 rounded-full bg-white/20 border border-white/30 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-lg">
                    {userPhotoUrl ? (
                        <LazyImage src={userPhotoUrl} alt="User" fill className="object-cover" unoptimized />
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
                    {typeof content === "string" ? (
                        <MarkdownRenderer content={content} isUserMessage={role === "user"} isStreaming={isStreaming} />
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
                            {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>

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
                                <ActionButton
                                    variant={role === "user" ? "icon_user" : "icon_agent"}
                                    onClick={() => onCopy?.(typeof content === "string" ? content : getTextContent(content))}
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

