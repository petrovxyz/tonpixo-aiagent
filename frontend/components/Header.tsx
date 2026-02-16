"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/context/TelegramContext"
import { usePathname } from "next/navigation"
import { getAssetUrl } from "@/lib/assetsUrl"
import { LazyImage } from "@/components/LazyImage"

export function Header({ className }: { className?: string }) {
    const { user, isMobile } = useTelegram()
    const pathname = usePathname()
    const showUser = pathname !== "/chat" && pathname !== "/" && user?.photo_url

    return (
        <div className={cn("flex items-center justify-center gap-3 relative", isMobile ? "mt-24" : "mt-10", className)}>
            {showUser && (
                <motion.div
                    layout
                    className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-white/30 shadow-lg pointer-events-auto"
                >
                    <LazyImage
                        src={user?.photo_url || ""}
                        alt="User"
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                    />
                </motion.div>
            )}

            <motion.div
                layout
                className="z-20 pointer-events-auto bg-[#4FC3F7] flex justify-center rounded-full py-2 border-2 border-white/20 inset-shadow-sm inset-shadow-white/30"
            >
                <div className="flex items-center gap-2 text-[26px] font-extrabold font-sans tracking-tight px-6">
                    <div className="relative w-8 h-8">
                        <LazyImage
                            src={getAssetUrl("logo.svg")}
                            alt="Tonpixo Logo"
                            fill
                            sizes="32px"
                            className="object-contain"
                        />
                    </div>
                    <span className="text-black">tonpixo</span>
                </div>
            </motion.div>
        </div>
    )
}
