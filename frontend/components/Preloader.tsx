"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"
import Image from "next/image"
import { useUI } from "@/context/UIContext"

export default function Preloader() {
    const { isInitialLoading, setIsInitialLoading } = useUI()
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        // Ensure the preloader shows for at least a short duration for the "premium" feel
        const timer = setTimeout(() => {
            setIsVisible(false)
            // Wait a bit for the exit animation to start before showing the main content
            setTimeout(() => {
                setIsInitialLoading(false)
            }, 300)
        }, 2200)

        return () => clearTimeout(timer)
    }, [setIsInitialLoading])

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{
                        opacity: 0,
                        transition: { duration: 1, ease: [0.43, 0.13, 0.23, 0.96] }
                    }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-[#4FC3F7] to-[#29B6F6]"
                >
                    <div className="relative flex flex-col items-center z-10">
                        {/* Outer Glow Ring */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: [0.8, 1.2, 1],
                                opacity: [0, 0.3, 0.1],
                            }}
                            transition={{
                                duration: 2.5,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="absolute inset-[-60px] rounded-full bg-white/40 blur-[80px]"
                        />

                        {/* Logo Container */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 10 }}
                            animate={{
                                scale: 1,
                                opacity: 1,
                                y: 0,
                                transition: {
                                    duration: 1.2,
                                    ease: [0.43, 0.13, 0.23, 0.96]
                                }
                            }}
                            className="relative"
                        >
                            <Image
                                src="/logo.svg"
                                alt="TONPixo Logo"
                                width={120}
                                height={120}
                                priority
                            />
                        </motion.div>

                        {/* Progress Line */}
                        <motion.div
                            className="mt-12 h-[6px] w-32 bg-black/10 rounded-full overflow-hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                        >
                            <motion.div
                                className="h-full bg-white"
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{
                                    duration: 2.2,
                                    ease: "easeInOut"
                                }}
                            />
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
