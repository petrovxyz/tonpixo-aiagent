"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"
import Image from "next/image"
import { useUI } from "@/context/UIContext"
import { useTelegram } from "@/context/TelegramContext"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons"
import { getAssetUrl } from "@/lib/assetsUrl"
import { DEFAULT_BLUR_DATA_URL } from "@/lib/imagePlaceholders"

export default function Preloader() {
    const { isInitialLoading, setIsInitialLoading } = useUI()
    const { isLoading: isTelegramLoading, error: telegramError } = useTelegram()
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        // If there is a telegram error, keep the preloader visible to show the error
        if (telegramError) {
            setIsVisible(true)
            return
        }

        // Wait for telegram loading to finish before starting the timer
        if (isTelegramLoading) return

        // Ensure the preloader shows for at least a short duration for the "premium" feel
        const timer = setTimeout(() => {
            setIsVisible(false)
            // Wait a bit for the exit animation to start before showing the main content
            setTimeout(() => {
                setIsInitialLoading(false)
            }, 300)
        }, 2200)

        return () => clearTimeout(timer)
    }, [setIsInitialLoading, isTelegramLoading, telegramError])

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{
                        opacity: 0,
                        transition: { duration: 1, ease: [0.43, 0.13, 0.23, 0.96] }
                    }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
                >
                    <Image
                        src={getAssetUrl("images/preloader.webp")}
                        alt="Preloader background"
                        fill
                        sizes="100vw"
                        className="object-cover"
                        priority
                        placeholder="blur"
                        blurDataURL={DEFAULT_BLUR_DATA_URL}
                    />
                    {/* Optional: Add a subtle overlay to maintain contrast for the logo/text if needed */}
                    <div className="absolute inset-0 transition-opacity" />

                    <div className="relative flex flex-col items-center z-10 px-8 text-center">
                        {/* Logo & Text Container */}
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
                            className="flex items-center gap-2 text-[32px] font-extrabold font-sans tracking-tight mb-6"
                        >
                            <div className="relative w-12 h-12">
                                <Image
                                    src={getAssetUrl("logo.svg")}
                                    alt="Tonpixo logo"
                                    fill
                                    sizes="48px"
                                    className="object-contain"
                                    priority
                                    placeholder="blur"
                                    blurDataURL={DEFAULT_BLUR_DATA_URL}
                                />
                            </div>
                            <span className="text-black">tonpixo</span>
                        </motion.div>

                        {/* Error Message or Progress */}
                        {telegramError ? (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center gap-3 text-white max-w-sm"
                            >
                                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mb-2">
                                    <FontAwesomeIcon icon={faTriangleExclamation} className="text-xl" />
                                </div>
                                <h3 className="text-xl font-bold">Connection Failed</h3>
                                <p className="text-white/80 font-medium leading-relaxed">
                                    {telegramError}
                                </p>
                            </motion.div>
                        ) : (
                            <motion.div
                                className="h-[6px] w-28 bg-black/10 rounded-full overflow-hidden"
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
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}