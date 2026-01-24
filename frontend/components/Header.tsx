"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export function Header({ className }: { className?: string }) {
    return (
        <motion.div
            layout
            className={cn(
                "z-20 pointer-events-auto bg-white/10 flex justify-center backdrop-blur-sm rounded-full py-3 border-2 border-white/20 inset-shadow-sm inset-shadow-white/30 mt-10",
                className
            )}
        >
            <div className="flex items-center gap-2 text-[26px] font-extrabold font-sans tracking-tight">
                <div className="w-8 h-8">
                    <img src="/logo.svg" alt="Tonpixo Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-black">tonpixo</span>
            </div>
        </motion.div>
    )
}
