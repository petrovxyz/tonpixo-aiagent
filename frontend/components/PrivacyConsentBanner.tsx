"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { QABottomSheet, QAItem } from "@/components/QABottomSheet"
import { getAssetUrl } from "@/lib/assetsUrl"
import { useUI } from "@/context/UIContext"
import { usePathname } from "next/navigation"

const STORAGE_KEY = "tonpixo_privacy_ack_v1"
const BASE_OFFSET = 24
const GAP = 12

export function PrivacyConsentBanner() {
    const { isInitialLoading } = useUI()
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)
    const [acknowledged, setAcknowledged] = useState<boolean | null>(null)
    const [isSheetOpen, setIsSheetOpen] = useState(false)
    const [bottomOffset, setBottomOffset] = useState(BASE_OFFSET)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted) return
        const stored = localStorage.getItem(STORAGE_KEY)
        setAcknowledged(stored === "1")
    }, [mounted])

    useEffect(() => {
        if (!mounted) return

        const computeOffset = () => {
            let offset = BASE_OFFSET
            const nav = document.getElementById("bottom-nav")
            if (nav && nav.offsetHeight) {
                offset = Math.max(offset, BASE_OFFSET + nav.offsetHeight + GAP)
            }
            const chatInput = document.getElementById("chat-input-bar")
            if (chatInput && chatInput.offsetHeight) {
                offset = Math.max(offset, chatInput.offsetHeight + GAP)
            }
            setBottomOffset(offset)
        }

        computeOffset()

        const nav = document.getElementById("bottom-nav")
        const chatInput = document.getElementById("chat-input-bar")
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(computeOffset)
        if (observer && nav) observer.observe(nav)
        if (observer && chatInput) observer.observe(chatInput)

        window.addEventListener("resize", computeOffset)
        return () => {
            observer?.disconnect()
            window.removeEventListener("resize", computeOffset)
        }
    }, [mounted, pathname])

    const handleAgree = () => {
        localStorage.setItem(STORAGE_KEY, "1")
        setAcknowledged(true)
    }

    const privacyItem: QAItem = {
        id: "privacy",
        question: "Your data and privacy",
        answer:
            "We process the address user enter and the questions user ask to improve responses. We also collect some basic user info and logs to keep Tonpixo running smoothly and prevent abuse. We do not sell or share your data with third parties.",
        image: getAssetUrl("images/banner_data_privacy.webp"),
    }

    const shouldShow = acknowledged === false

    if (!mounted || isInitialLoading) return null

    return (
        <>
            <AnimatePresence>
                {shouldShow && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                        className="fixed left-0 right-0 z-40 flex justify-center px-6 pointer-events-none"
                        style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))` }}
                    >
                        <div className="pointer-events-auto w-full max-w-2xl rounded-full bg-[#0098EA]/95 shadow-2xl px-4 py-3 flex items-center justify-between gap-4">
                            <span className="text-sm font-semibold text-white/90">About your privacy</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsSheetOpen(true)}
                                    className="px-3 py-1.5 rounded-full bg-white/10 text-white/90 text-xs font-semibold border border-white/20 hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
                                    aria-label="Read about privacy"
                                >
                                    Read
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAgree}
                                    className="px-3 py-1.5 rounded-full bg-white text-[#0098EA] text-xs font-bold shadow-md hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
                                    aria-label="Agree to privacy terms"
                                >
                                    Agree
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isSheetOpen && (
                    <QABottomSheet
                        item={privacyItem}
                        onClose={() => setIsSheetOpen(false)}
                    />
                )}
            </AnimatePresence>
        </>
    )
}
