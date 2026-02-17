"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

import { BotIcon, type BotIconHandle } from "@/components/icons/BotIcon"
import { HistoryIcon, type HistoryIconHandle } from "@/components/icons/HistoryIcon"
import { BookmarkIcon, type BookmarkIconHandle } from "@/components/icons/BookmarkIcon"
import { SettingsIcon, type SettingsIconHandle } from "@/components/icons/SettingsIcon"

type IconHandle = BotIconHandle | HistoryIconHandle | BookmarkIconHandle | SettingsIconHandle

const NAV_ITEMS = [
    { id: "explore", label: "Explore", path: "/explore" },
    { id: "history", label: "History", path: "/history" },
    { id: "favs", label: "Favs", path: "/favs" },
    { id: "settings", label: "Settings", path: "/settings" },
] as const

export function BottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

    const botRef = useRef<BotIconHandle>(null)
    const historyRef = useRef<HistoryIconHandle>(null)
    const bookmarkRef = useRef<BookmarkIconHandle>(null)
    const settingsRef = useRef<SettingsIconHandle>(null)

    const iconRefs: Record<string, React.RefObject<IconHandle | null>> = {
        explore: botRef,
        history: historyRef,
        favs: bookmarkRef,
        settings: settingsRef,
    }

    const prevPathnameRef = useRef(pathname)

    useEffect(() => {
        // When pathname changes, animate the new active icon (start) and stop the old one
        const prevPath = prevPathnameRef.current
        prevPathnameRef.current = pathname

        // Find which nav item corresponds to old and new path
        const oldItem = NAV_ITEMS.find(item => item.path === prevPath)
        const newItem = NAV_ITEMS.find(item => item.path === pathname)

        // Stop animation on the previously active icon (idle -> end)
        if (oldItem && oldItem.id !== newItem?.id) {
            const oldRef = iconRefs[oldItem.id]
            oldRef?.current?.stopAnimation()
        }

        // Start animation on the newly active icon (start -> idle)
        if (newItem) {
            const newRef = iconRefs[newItem.id]
            newRef?.current?.startAnimation()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname])

    // Animate on initial mount for the active tab
    useEffect(() => {
        const activeItem = NAV_ITEMS.find(item => item.path === pathname)
        if (activeItem) {
            const ref = iconRefs[activeItem.id]
            // Small delay to ensure refs are attached
            const timeout = setTimeout(() => {
                ref?.current?.startAnimation()
            }, 300)
            return () => clearTimeout(timeout)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleNavClick = (itemId: string, path: string) => {
        // Start animation immediately on tap
        const ref = iconRefs[itemId]
        ref?.current?.startAnimation()
        router.push(path)
    }

    const renderIcon = (itemId: string, size: number) => {
        switch (itemId) {
            case "explore":
                return <BotIcon ref={botRef} size={size} />
            case "history":
                return <HistoryIcon ref={historyRef} size={size} />
            case "favs":
                return <BookmarkIcon ref={bookmarkRef} size={size} />
            case "settings":
                return <SettingsIcon ref={settingsRef} size={size} />
            default:
                return null
        }
    }

    return (
        <div id="bottom-nav" className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none">
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
                className="bg-[#4FC3F7] rounded-full border-2 border-white/20 p-1.5 flex items-center relative shadow-2xl pointer-events-auto w-full max-w-sm inset-shadow-sm inset-shadow-white/30 overflow-hidden"
            >
                <AnimatePresence>
                    {ripples.map((ripple) => (
                        <motion.span
                            key={ripple.id}
                            initial={{ scale: 0, opacity: 0.35 }}
                            animate={{ scale: 3, opacity: 0 }}
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

                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.path
                    return (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id, item.path)}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center py-2 px-1 relative z-10 transition-colors duration-300 cursor-pointer",
                                isActive ? "text-white" : "text-gray-200 hover:text-white"
                            )}
                        >
                            <div className="mb-1">
                                {renderIcon(item.id, 20)}
                            </div>
                            <span className="text-[10px] font-bold uppercase">{item.label}</span>

                            {isActive && (
                                <motion.div
                                    layoutId="bottom-nav-highlight"
                                    className="absolute inset-0 bg-white/10 inset-shadow-sm inset-shadow-white/50 rounded-full -z-10"
                                    transition={{
                                        type: "spring",
                                        stiffness: 380,
                                        damping: 30
                                    }}
                                />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
