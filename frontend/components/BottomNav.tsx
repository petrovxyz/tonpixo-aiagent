"use client"

import { usePathname, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCompass, faHeart, faGear } from "@fortawesome/free-solid-svg-icons"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
    { id: "discover", label: "Discover", icon: faCompass, path: "/discover" },
    { id: "favs", label: "Favs", icon: faHeart, path: "/favs" },
    { id: "settings", label: "Settings", icon: faGear, path: "/settings" },
]

export function BottomNav() {
    const pathname = usePathname()
    const router = useRouter()

    return (
        <div className="fixed bottom-10 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none">
            <div className="bg-white/10 backdrop-blur-xl rounded-full border-2 border-white/20 p-1.5 flex items-center relative shadow-2xl pointer-events-auto w-full max-w-sm inset-shadow-sm inset-shadow-white/30">
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
