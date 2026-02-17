"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faBookmark, faSpinner, faChevronRight, faTrash, faCopy } from "@fortawesome/free-solid-svg-icons"
import axios from "axios"
import { useTelegram } from "@/context/TelegramContext"
import { useToast } from "@/components/Toast"
import { getApiUrl } from "@/lib/backendUrl"

interface Favourite {
    address: string
    name?: string
    created_at: string
}

export default function FavsPage() {
    const router = useRouter()
    const { user } = useTelegram()
    const { showToast } = useToast()
    const [favourites, setFavourites] = useState<Favourite[]>([])
    const [isFetching, setIsFetching] = useState(false)
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number; address?: string }[]>([])
    const rippleIdRef = useRef(0)

    const fetchFavourites = useCallback(async () => {
        if (!user?.id) return

        try {
            const apiUrl = getApiUrl()
            const response = await axios.get(`${apiUrl}/api/favourites`, {
                params: { user_id: user.id }
            })
            setFavourites(response.data.favourites || [])
        } catch (error) {
            console.error("Failed to load favourites:", error)
        }
    }, [user])

    const loadFavourites = useCallback(async () => {
        if (!user?.id) return
        setIsFetching(true)
        try {
            await fetchFavourites()
        } finally {
            setIsFetching(false)
        }
    }, [user, fetchFavourites])

    useEffect(() => {
        void loadFavourites()
    }, [loadFavourites])

    const handleRemoveFavourite = async (address: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!user?.id) return

        try {
            const apiUrl = getApiUrl()
            await axios.delete(`${apiUrl}/api/favourites/${encodeURIComponent(address)}`, {
                params: { user_id: user.id }
            })
            setFavourites(prev => prev.filter(f => f.address !== address))
            showToast("Removed from favourites", "success")
        } catch (error) {
            console.error("Failed to remove favourite:", error)
            showToast("Failed to remove favourite", "error")
        }
    }

    const handleCopyAddress = (address: string, e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(address)
        showToast("Address copied successfully", "success")
    }

    const formatDate = (dateString: string) => {
        const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z'
        const date = new Date(utcString)
        const now = new Date()
        const diff = now.getTime() - date.getTime()

        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        if (now.getFullYear() === date.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
        }
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    }

    const createRipple = (e: React.MouseEvent<HTMLButtonElement>, address?: string) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const size = Math.max(rect.width, rect.height)

        const ripple = { id: rippleIdRef.current++, x, y, size, address }
        setRipples(prev => [...prev, ripple])
    }

    const truncateAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`
    }

    const hasUser = Boolean(user?.id)
    const visibleFavourites = hasUser ? favourites : []
    const isLoading = user === undefined || (hasUser && isFetching)

    return (
        <div className="relative w-full flex flex-col max-w-2xl mx-auto px-6 pb-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 py-2 mb-4"
            >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                    <FontAwesomeIcon icon={faBookmark} className="text-lg" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white">Favourites</h1>
                    <p className="text-white/60 text-xs">
                        {visibleFavourites.length} address{visibleFavourites.length !== 1 ? 'es' : ''}
                    </p>
                </div>
            </motion.div>

            {/* Favourites List Container */}
            <div
                className="flex-1 overflow-y-auto overflow-x-hidden rounded-3xl pb-20"
                style={{
                    maxHeight: 'calc(95vh - 260px)',
                    minHeight: '200px'
                }}
            >
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-white/50 gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xl" />
                        </div>
                        <span className="text-sm">Loading favourites...</span>
                    </div>
                ) : visibleFavourites.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center py-8 text-center"
                    >
                        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-5 border border-white/10">
                            <FontAwesomeIcon icon={faBookmark} className="text-white/60 text-2xl" />
                        </div>
                        <p className="font-semibold text-lg text-white mb-1">No favourites yet</p>
                        <p className="text-white/50 font-medium text-sm mb-6">Save wallet address from chat</p>
                        <button
                            onClick={() => router.push('/explore')}
                            className="bg-[#0098EA] hover:bg-[#0088CC] text-white rounded-full py-3 w-[150px] font-medium text-sm shadow-lg transition-all active:scale-95 transform duration-200 cursor-pointer"
                        >
                            Start exploring
                        </button>
                    </motion.div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {visibleFavourites.map((fav, index) => (
                            <motion.div
                                key={fav.address}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                            >
                                <button
                                    onClick={(e) => {
                                        createRipple(e, fav.address)
                                        setTimeout(() => {
                                            router.push(`/chat?address=${encodeURIComponent(fav.address)}`)
                                        }, 150)
                                    }}
                                    className="w-full relative overflow-hidden bg-white/10 hover:bg-white/15 rounded-3xl p-4 text-left transition-all duration-200 active:scale-[0.98] group cursor-pointer"
                                >
                                    <AnimatePresence>
                                        {ripples.filter(r => r.address === fav.address).map((ripple) => (
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
                                            <div className="flex items-center mb-1">
                                                <p className="text-white font-medium text-[15px] truncate">
                                                    {fav.name || truncateAddress(fav.address)}
                                                </p>
                                            </div>
                                            {fav.name && (
                                                <p className="text-white/50 font-mono text-xs truncate mb-1">
                                                    {truncateAddress(fav.address)}
                                                </p>
                                            )}
                                            <span className="text-white/50 font-medium text-xs">
                                                {formatDate(fav.created_at)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => handleCopyAddress(fav.address, e)}
                                                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center transition-all hover:bg-white/20 text-white cursor-pointer"
                                            >
                                                <FontAwesomeIcon icon={faCopy} className="text-[12px]" />
                                            </button>
                                            <button
                                                onClick={(e) => handleRemoveFavourite(fav.address, e)}
                                                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-400 text-white cursor-pointer"
                                            >
                                                <FontAwesomeIcon icon={faTrash} className="text-[12px]" />
                                            </button>
                                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center transition-all group-hover:bg-white/15">
                                                <FontAwesomeIcon
                                                    icon={faChevronRight}
                                                    className="text-white text-[12px]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
