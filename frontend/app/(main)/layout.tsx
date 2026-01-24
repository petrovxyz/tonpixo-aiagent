"use client"

import { BottomNav } from "@/components/BottomNav"
import { Header } from "@/components/Header"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { UIProvider, useUI } from "@/context/UIContext"

const ROUTES = ["/discover", "/favs", "/settings", "/chat"]

const variants = {
    enter: (direction: number) => ({
        x: direction > 0 ? "100%" : direction < 0 ? "-100%" : 0,
        opacity: 0,
        filter: "blur(10px)",
    }),
    center: {
        x: 0,
        opacity: 1,
        filter: "blur(0px)",
        scale: 1,
    },
    exit: (direction: number) => ({
        x: direction < 0 ? "100%" : direction > 0 ? "-100%" : 0,
        opacity: 0,
        filter: "blur(10px)",
    }),
}

function LayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { isOverlayOpen, isInitialLoading } = useUI()

    // Track previous path and index to calculate direction
    const [tuple, setTuple] = useState<[string, number]>([pathname, 0]); // [path, direction]

    if (tuple[0] !== pathname) {
        const prevIndex = ROUTES.indexOf(tuple[0]);
        const nextIndex = ROUTES.indexOf(pathname);
        const direction = (prevIndex !== -1 && nextIndex !== -1) ? (nextIndex > prevIndex ? 1 : -1) : 0;
        setTuple([pathname, direction]);
    }

    const direction = tuple[1];
    const isChatPage = pathname === "/chat";

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{
                opacity: isInitialLoading ? 0 : 1,
                scale: isInitialLoading ? 0.98 : 1,
                filter: isInitialLoading ? "blur(10px)" : "blur(0px)"
            }}
            transition={{ duration: 1.2, ease: [0.43, 0.13, 0.23, 0.96] }}
            className="min-h-screen text-white font-sans overflow-hidden relative selection:bg-white/30 flex flex-col"
        >
            {/* Background elements (blurred shapes only, main gradient is in RootLayout) */}
            <div className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] bg-white/10 rounded-full blur-[120px] pointer-events-none z-0" />

            {/* Header (Shared) */}
            {!isChatPage && (
                <div className={cn(
                    "px-4 max-w-3xl mx-auto w-full relative transition-all duration-300",
                    isOverlayOpen ? "z-10 opacity-50 blur-[2px]" : "z-30 opacity-100 blur-0"
                )}>
                    <Header />
                </div>
            )}

            <div className={cn("flex-1 relative z-20 w-full overflow-hidden", !isChatPage && "mt-4")}>
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.div
                        key={pathname}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                            x: { type: "spring", stiffness: 280, damping: 32 },
                            opacity: { duration: 0.3 },
                            filter: { duration: 0.3 }
                        }}
                        className="w-full h-full flex flex-col items-center"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </div>

            {!isChatPage && (
                <motion.div
                    className="relative z-30"
                    initial={false}
                    animate={{
                        y: isOverlayOpen ? 100 : 0,
                        opacity: isOverlayOpen ? 0 : 1,
                        pointerEvents: isOverlayOpen ? "none" : "auto"
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                    <BottomNav />
                </motion.div>
            )}
        </motion.div>
    )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return <LayoutContent>{children}</LayoutContent>
}
