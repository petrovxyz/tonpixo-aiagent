"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faMessage, faSpinner, faChevronRight, faClock } from "@fortawesome/free-solid-svg-icons"
import axios from "axios"
import { useTelegram } from "@/context/TelegramContext"
import { cn } from "@/lib/utils"

interface ChatSession {
    chat_id: string
    title: string
    updated_at: string
}

export default function HistoryPage() {
    const router = useRouter()
    const { user } = useTelegram()
    const [chats, setChats] = useState<ChatSession[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

    useEffect(() => {
        const fetchHistory = async () => {
            if (!user?.id) {
                // If checking auth or no user, maybe wait? 
                // For now, if no user id after some time, stop loading
                if (user === null) return; // Wait for user to be loaded (or null if not logged in?)
                // Assuming user is loaded eventually or remains null
            }

            if (!user?.id) return

            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
                const response = await axios.get(`${apiUrl}/api/history`, {
                    params: { user_id: user.id }
                })
                setChats(response.data.chats || [])
            } catch (error) {
                console.error("Failed to load history:", error)
            } finally {
                setIsLoading(false)
            }
        }

        if (user) {
            fetchHistory()
        } else {
            // Short timeout to allow user context to load? 
            // Or just rely on useEffect dependency
            setIsLoading(false)
        }
    }, [user])

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = now.getTime() - date.getTime()

        // If less than 24 hours
        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        // If this year
        if (now.getFullYear() === date.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
        }
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    }

    return (
        <div className="relative w-full flex flex-col px-6 max-w-2xl mx-auto flex-1 pt-12 pb-24">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 mb-8"
            >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                    <FontAwesomeIcon icon={faClock} className="text-white text-lg" />
                </div>
                <h1 className="text-2xl font-bold text-white">History</h1>
            </motion.div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/50 gap-3">
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
                    <span>Loading chats...</span>
                </div>
            ) : chats.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-20 text-white/50 text-center"
                >
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-2xl">
                        <FontAwesomeIcon icon={faMessage} />
                    </div>
                    <p className="font-medium text-lg text-white/80">No history yet</p>
                    <p className="text-sm mt-1">Your conversations will appear here</p>
                    <button
                        onClick={() => router.push('/explore')}
                        className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white font-medium transition-colors cursor-pointer"
                    >
                        Start a new chat
                    </button>
                </motion.div>
            ) : (
                <div className="flex flex-col gap-3">
                    {chats.map((chat, index) => (
                        <motion.div
                            key={chat.chat_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
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
                                    setRipples(prev => [...prev, ripple]);

                                    // Delay navigation slightly for ripple
                                    setTimeout(() => {
                                        router.push(`/chat?chat_id=${chat.chat_id}`)
                                    }, 200)
                                }}
                                className="w-full relative overflow-hidden bg-white/10 hover:bg-white/15 border border-white/5 rounded-2xl p-4 text-left transition-all active:scale-[0.99] group cursor-pointer"
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

                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-medium truncate text-[15px] mb-1">
                                            {chat.title || "New Chat"}
                                        </h3>
                                        <span className="text-white/40 text-xs">
                                            {formatDate(chat.updated_at)}
                                        </span>
                                    </div>
                                    <FontAwesomeIcon
                                        icon={faChevronRight}
                                        className="text-white/20 text-xs mt-1 transition-transform group-hover:translate-x-1"
                                    />
                                </div>
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    )
}
