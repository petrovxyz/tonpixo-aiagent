"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, PanInfo } from "framer-motion"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTimes } from "@fortawesome/free-solid-svg-icons"
import { useUI } from "@/context/UIContext"

export interface QAItem {
    id: string
    question: string
    answer: string
    image: string
}

interface QABottomSheetProps {
    item: QAItem
    onClose: () => void
}

export const QABottomSheet = ({ item, onClose }: QABottomSheetProps) => {
    const { setIsOverlayOpen } = useUI()
    const [mounted, setMounted] = useState(false)

    // Handle mounting for Portal and global state
    useEffect(() => {
        setMounted(true)
        setIsOverlayOpen(true)
        return () => setIsOverlayOpen(false)
    }, [setIsOverlayOpen])

    // Drag end handler to close if dragged down sufficiently
    const onDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.y > 10 || info.velocity.y > 50) {
            onClose()
        }
    }

    if (!mounted) return null

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-none">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />

            {/* Sheet */}
            <motion.div
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.1}
                onDragEnd={onDragEnd}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
                className="bg-white text-gray-900 w-full max-w-lg rounded-t-[30px] shadow-2xl overflow-hidden relative pointer-events-auto flex flex-col max-h-[95vh]"
                style={{ willChange: "transform" }}
            >
                {/* Drag Handle */}
                <div className="absolute top-0 left-0 right-0 h-14 flex justify-center items-start pt-3 z-30 cursor-grab active:cursor-grabbing">
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Close Button (Absolute) */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-40 w-8 h-8 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-full text-gray-500 transition-colors"
                >
                    <FontAwesomeIcon icon={faTimes} size="sm" />
                </button>

                {/* Content */}
                <div className="flex flex-col h-full overflow-y-auto pb-8">
                    {/* Image Section */}
                    <div className="relative w-full h-50 bg-gray-100 shrink-0 rounded-t-3xl">
                        <img
                            src={item.image}
                            alt={item.question}
                            className="w-full h-full object-cover"
                        />
                    </div>

                    {/* Text Section */}
                    <div className="px-6 pt-6 text-lg leading-relaxed text-gray-600 font-medium space-y-4">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">{item.question}</h2>
                        <p>{item.answer}</p>

                        {/* Check Button */}
                        <button
                            onClick={onClose}
                            className="w-full bg-[#0098EA] text-white rounded-full mt-2 py-4 font-bold text-lg hover:bg-[#0088CC] transition-all shadow-lg active:scale-95 transform duration-200"
                        >
                            Understand
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    )
}
