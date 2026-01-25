"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCheckCircle, faSpinner, faArrowUp, faArrowLeft } from "@fortawesome/free-solid-svg-icons"
import axios from "axios"
import { Header } from "@/components/Header"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/context/TelegramContext"

// Message Type Definition
interface Message {
    id: string
    role: "user" | "agent"
    content: React.ReactNode
    timestamp: Date
}

const MessageBubble = ({ role, content, timestamp }: { role: "user" | "agent"; content: React.ReactNode; timestamp: Date }) => (
    <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={cn(
            "flex w-full mb-6 px-4 md:px-0 gap-3",
            role === "user" ? "flex-row-reverse" : "flex-row items-end"
        )}
    >
        {role === "agent" && (
            <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-lg">
                <img src="/logo.svg" alt="Agent" className="w-6 h-6 object-contain" />
            </div>
        )}
        {role === "user" && <div className="w-10 h-10 flex-shrink-0" />}
        <div className={cn(
            "relative max-w-[85%] md:max-w-[75%] px-5 py-4 text-[16px] font-medium leading-relaxed shadow-lg transition-all",
            role === "user"
                ? "bg-white text-gray-900 rounded-3xl rounded-br-sm"
                : "bg-white/10 border border-white/20 text-white rounded-3xl rounded-bl-sm ring-1 ring-white/5"
        )}>
            <div className="whitespace-pre-wrap break-words [hyphens:auto] [word-break:normal]">
                {content}
            </div>
            <div className={cn(
                "text-[10.5px] opacity-70 mt-1.5 font-bold tracking-tight",
                role === "user" ? "text-right text-gray-400" : "text-left text-white/70"
            )}>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    </motion.div>
)


function ChatContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const addressParam = searchParams.get("address")
    const { isMobile } = useTelegram()

    const [messages, setMessages] = useState<Array<Message>>([])
    const [inputValue, setInputValue] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [count, setCount] = useState<number>(0)

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const hasStartedRef = useRef(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // Existing Polling Logic
    const pollStatus = async (jobId: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.get(`${apiUrl}/api/status/${jobId}`)
            const data = response.data

            if (data.status === "processing" || data.status === "queued") {
                setCount(data.count || 0)
                setTimeout(() => pollStatus(jobId), 1000)
            } else if (data.status === "success") {
                setIsLoading(false)
                addMessage("agent", (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center font-bold text-white gap-1">
                            <FontAwesomeIcon icon={faCheckCircle} />
                            <span>Analysis complete</span>
                        </div>
                        <p className="text-white/90">
                            I'm done! {data.count} transactions have been scanned and I'm ready for your questions.
                        </p>
                    </div>
                ))
                removeLoadingMessage()
            } else if (data.status === "empty") {
                setIsLoading(false)
                removeLoadingMessage()
                addMessage("agent", "I couldn't find any transactions for this address.")
            } else if (data.status === "error") {
                setIsLoading(false)
                removeLoadingMessage()
                addMessage("agent", `Error: ${data.error || "Failed to generate history"}`)
            }
        } catch (err) {
            setIsLoading(false)
            removeLoadingMessage()
            addMessage("agent", "Connection to background service lost.")
        }
    }

    const startSearch = async (targetAddress: string) => {
        setIsLoading(true)
        setMessages(prev => [...prev.filter(m => m.content !== "collecting"), {
            id: "loading-state-" + Date.now(),
            role: "agent",
            content: "collecting",
            timestamp: new Date()
        }])

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            const response = await axios.post(`${apiUrl}/api/generate`, {
                address: targetAddress
            })

            if (response.data.job_id) {
                pollStatus(response.data.job_id)
            }
        } catch (err: any) {
            removeLoadingMessage()
            addMessage("agent", err.response?.data?.detail || "Failed to start generation.")
            setIsLoading(false)
        }
    }

    const addMessage = (role: "user" | "agent", content: React.ReactNode) => {
        setMessages(prev => [
            ...prev.filter(m => m.content !== "collecting"),
            {
                id: Math.random().toString(36).substr(2, 9),
                role,
                content,
                timestamp: new Date()
            }
        ])
    }

    const removeLoadingMessage = () => {
        setMessages(prev => prev.filter(m => m.content !== "collecting"))
    }

    const handleSend = async () => {
        if (!inputValue.trim()) return
        const text = inputValue.trim()
        setInputValue("")
        addMessage("user", text)

        if (text.length > 20 && (text.startsWith("EQ") || text.startsWith("UQ") || text.startsWith("0:"))) {
            startSearch(text)
        } else {
            setIsLoading(true)
            setTimeout(() => {
                setIsLoading(false)
                addMessage("agent", "I'm ready to analyze any TON address. Please paste one here!")
            }, 800)
        }
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
            startSearch(addressParam)
        } else if (!hasStartedRef.current) {
            hasStartedRef.current = true
            addMessage("agent", "Welcome! Share a TON wallet address to start the analysis.")
        }
    }, [addressParam])

    return (
        <div className="relative w-full h-[100dvh] flex flex-col">
            {/* Main Scrollable Area */}
            <div className="flex-1 overflow-y-auto z-10 scroll-smooth scrollbar-hide">
                <div className="max-w-2xl mx-auto w-full min-h-full flex flex-col justify-end pt-32 pb-32 pb-40">
                    <AnimatePresence initial={false}>
                        {messages.map((msg) => (
                            <div key={msg.id}>
                                {msg.content === "collecting" ? (
                                    <MessageBubble role="agent" timestamp={msg.timestamp} content={
                                        <div className="flex items-center gap-4">
                                            <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                                                <FontAwesomeIcon icon={faSpinner} className="animate-spin text-white/80 text-xl" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="animate-pulse font-semibold">Scanning TON Blockchain...</span>
                                                {count > 0 && <span className="text-xs text-white/50">{count} transactions detected</span>}
                                            </div>
                                        </div>
                                    } />
                                ) : (
                                    <MessageBubble role={msg.role} content={msg.content} timestamp={msg.timestamp} />
                                )}
                            </div>
                        ))}
                    </AnimatePresence>
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-20 pointer-events-none">
                <div className="max-w-3xl mx-auto w-full px-4">
                    <div className="flex items-center gap-2 pointer-events-auto">
                        <button
                            onClick={() => router.push("/explore")}
                            className={cn(
                                "flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-full text-black hover:bg-white/20 transition-all shadow-lg active:scale-95 inset-shadow-sm inset-shadow-white/30 cursor-pointer",
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
                <div className="max-w-2xl mx-auto w-full p-6 pb-10 md:pb-12 pointer-events-auto">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-white/5 rounded-full group-focus-within:bg-white/10 transition-all" />
                        <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-full p-2 flex items-center shadow-2xl transition-all focus-within:bg-white/20 focus-within:border-white/40 ring-1 ring-white/10 inset-shadow-sm inset-shadow-white/30">
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
