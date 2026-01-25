"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/context/TelegramContext"
import { usePathname } from "next/navigation"

export function Header({ className }: { className?: string }) {
    const { user, isMobile } = useTelegram()
    const pathname = usePathname()
    const showUser = pathname !== "/chat" && pathname !== "/" && user?.photo_url

    return (
        <div className={cn("flex items-center justify-center gap-3 relative", isMobile ? "mt-24" : "mt-10", className)}>
            {showUser && (
                <motion.div
                    layout
                    className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/30 shadow-lg pointer-events-auto"
                >
                    <img src={user?.photo_url} alt="User" className="w-full h-full object-cover" />
                </motion.div>
            )}

            <motion.div
                layout
                className="z-20 pointer-events-auto bg-white/10 flex justify-center backdrop-blur-sm rounded-full py-2 border-2 border-white/20 inset-shadow-sm inset-shadow-white/30"
            >
                <div className="flex items-center gap-2 text-[26px] font-extrabold font-sans tracking-tight px-6">
                    <div className="w-8 h-8">
                        <img src="/logo.svg" alt="Tonpixo Logo" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-black">tonpixo</span>
                </div>
            </motion.div>
        </div>
    )
}
