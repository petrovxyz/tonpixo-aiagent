"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faMessage, faSpinner, faChevronRight, faClock, faWallet } from "@fortawesome/free-solid-svg-icons"
import axios from "axios"
import { useTelegram } from "@/context/TelegramContext"

interface ChatSession {
    chat_id: string
    title: string
    updated_at: string
    address?: string
    last_message?: string
    last_message_role?: 'user' | 'agent'
}

export default function HistoryPage() {
    const router = useRouter()
    const { user } = useTelegram()
    const [chats, setChats] = useState<ChatSession[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [nextKey, setNextKey] = useState<string | null>(null)
    const [totalCount, setTotalCount] = useState<number | null>(null)
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number; chatId?: string }[]>([])

    const fetchHistory = useCallback(async (lastKey?: string | null) => {
        if (!user?.id) return

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const params: { user_id: number; limit: number; last_key?: string } = {
                user_id: user.id,
                limit: 10
            }
            if (lastKey) {
                params.last_key = lastKey
            }

            const response = await axios.get(`${apiUrl}/api/history`, { params })
            const newChats = response.data.chats || []

            // Deduplicate by chat_id (in case of eventual consistency issues with DynamoDB GSI)
            const deduplicateChats = (chats: ChatSession[]): ChatSession[] => {
                const seen = new Set<string>()
                return chats.filter(chat => {
                    if (seen.has(chat.chat_id)) return false
                    seen.add(chat.chat_id)
                    return true
                })
            }

            if (lastKey) {
                // Appending to existing chats - deduplicate combined result
                setChats(prev => deduplicateChats([...prev, ...newChats]))
            } else {
                // Initial load
                setChats(deduplicateChats(newChats))
            }

            setNextKey(response.data.next_key || null)

            // Only set total count on initial load
            if (response.data.total_count !== null && response.data.total_count !== undefined) {
                setTotalCount(response.data.total_count)
            }
        } catch (error) {
            console.error("Failed to load history:", error)
        }
    }, [user])

    useEffect(() => {
        const loadInitial = async () => {
            if (!user?.id) {
                if (user === null) {
                    setIsLoading(false)
                }
                return
            }

            setIsLoading(true)
            await fetchHistory()
            setIsLoading(false)
        }

        if (user) {
            loadInitial()
        } else {
            setIsLoading(false)
        }
    }, [user, fetchHistory])

    const loadMore = async () => {
        if (!nextKey || isLoadingMore) return
        setIsLoadingMore(true)
        await fetchHistory(nextKey)
        setIsLoadingMore(false)
    }

    const formatDate = (dateString: string) => {
        // Backend sends UTC timestamps without 'Z' suffix, so we need to add it
        // to ensure JavaScript correctly parses it as UTC
        const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z'
        const date = new Date(utcString)
        const now = new Date()
        const diff = now.getTime() - date.getTime()

        // If less than 24 hours - show time in user's local timezone
        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        // If this year - show month and day
        if (now.getFullYear() === date.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
        }
        // Otherwise show full date
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    }

    const createRipple = (e: React.MouseEvent<HTMLButtonElement>, chatId?: string) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const size = Math.max(rect.width, rect.height)

        const ripple = { id: Date.now(), x, y, size, chatId }
        setRipples(prev => [...prev, ripple])
    }

    return (
        <div className="relative w-full flex flex-col max-w-2xl mx-auto px-6 pb-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 py-2 mb-4"
            >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                    <FontAwesomeIcon icon={faClock} className="text-white text-lg font-medium" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white">History</h1>
                    <p className="text-white/60 text-xs">
                        {totalCount !== null ? totalCount : chats.length} conversation{(totalCount !== null ? totalCount : chats.length) !== 1 ? 's' : ''}
                    </p>
                </div>
            </motion.div>

            {/* Chat List Container - max height limits, scrollable when needed */}
            <div
                className="flex-1 overflow-y-auto overflow-x-hidden rounded-3xl pb-20"
                style={{
                    maxHeight: 'calc(95vh - 260px)', // Account for header, top bar, and bottom nav
                    minHeight: '200px'
                }}
            >
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-white/50 gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xl" />
                        </div>
                        <span className="text-sm">Loading chats...</span>
                    </div>
                ) : chats.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center py-8 text-center"
                    >
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center mb-5 border border-white/10">
                            <FontAwesomeIcon icon={faMessage} className="text-white/60 text-2xl" />
                        </div>
                        <p className="font-semibold text-lg text-white mb-1">No history yet</p>
                        <p className="text-white/50 font-medium text-sm mb-6">Your conversations will appear here</p>
                        <button
                            onClick={() => router.push('/explore')}
                            className="bg-[#0098EA] hover:bg-[#0088CC] text-white rounded-full py-3 w-[150px] font-medium text-sm shadow-lg transition-all active:scale-95 transform duration-200 cursor-pointer"
                        >
                            Start exploring
                        </button>
                    </motion.div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {chats.map((chat, index) => (
                            <motion.div
                                key={chat.chat_id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                            >
                                <button
                                    onClick={(e) => {
                                        createRipple(e, chat.chat_id)
                                        setTimeout(() => {
                                            router.push(`/chat?chat_id=${chat.chat_id}`)
                                        }, 150)
                                    }}
                                    className="w-full relative overflow-hidden bg-white/10 hover:bg-white/15 rounded-3xl p-4 text-left transition-all duration-200 active:scale-[0.98] group cursor-pointer"
                                >
                                    <AnimatePresence>
                                        {ripples.filter(r => r.chatId === chat.chat_id).map((ripple) => (
                                            <motion.span
                                                key={ripple.id}
                                                initial={{ scale: 0, opacity: 0.35 }}
                                                animate={{ scale: 4, opacity: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.6, ease: "easeOut" }}
                                                onAnimationComplete={() => {
                                                    setRipples((prev) => prev.filter((r) => r.id !== ripple.id))
                                                }}
                                                className="absolute bg-white/20 rounded-full pointer-events-none"
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

                                    <div className="flex justify-between items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            {chat.address && (
                                                <div className="flex items-center text-white text-[12px] font-bold tracking-wider mb-2 opacity">
                                                    <span>{chat.address.slice(0, 6)}...{chat.address.slice(-4)}</span>
                                                </div>
                                            )}
                                            <p className="text-white font-medium text-[15px] truncate mb-1">
                                                {chat.last_message ? (
                                                    <>
                                                        <span className="text-white/50">{chat.last_message_role === 'user' ? 'You: ' : 'Tonpixo: '}</span>
                                                        {chat.last_message}
                                                    </>
                                                ) : (
                                                    chat.title || "New Chat"
                                                )}
                                            </p>
                                            <span className="text-white/35 text-xs">
                                                {formatDate(chat.updated_at)}
                                            </span>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center transition-all group-hover:bg-white/10">
                                            <FontAwesomeIcon
                                                icon={faChevronRight}
                                                className="text-white/50 text-[10px] transition-colors group-hover:text-white/70"
                                            />
                                        </div>
                                    </div>
                                </button>
                            </motion.div>
                        ))}

                        {/* Load More Button */}
                        {nextKey && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex justify-center pt-1 pb-3"
                            >
                                <button
                                    onClick={loadMore}
                                    disabled={isLoadingMore}
                                    className="items-center gap-2 cursor-pointer py-3 w-[150px] rounded-full bg-[#0098EA] hover:bg-[#0088CC] shadow-lg text-white active:scale-95 transform duration-200 hover:text-white/80 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoadingMore ? (
                                        <>
                                            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs mr-2" />
                                            <span>Loading...</span>
                                        </>
                                    ) : (
                                        <span>Load more</span>
                                    )}
                                </button>
                            </motion.div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
