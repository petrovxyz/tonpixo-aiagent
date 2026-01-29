"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCube, faStar, faGear } from "@fortawesome/free-solid-svg-icons"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
    { id: "explore", label: "Explore", icon: faCube, path: "/explore" },
    { id: "favs", label: "Favs", icon: faStar, path: "/favs" },
    { id: "settings", label: "Settings", icon: faGear, path: "/settings" },
]

export function BottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

    return (
        <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none">
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
                            onClick={() => router.push(item.path)}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center py-3 px-1 relative z-10 transition-colors duration-300 cursor-pointer",
                                isActive ? "text-white" : "text-white/60 hover:text-white"
                            )}
                        >
                            <FontAwesomeIcon icon={item.icon} className="text-[20px] mb-1" />
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
