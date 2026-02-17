"use client"

import React, { useState, useRef, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheckCircle, faExclamationCircle, faInfoCircle, faTimes } from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
    id: string
    message: string
    type: ToastType
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return context
}

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([])
    const toastIdRef = useRef(0)

    const showToast = (message: string, type: ToastType = 'success') => {
        const id = `toast-${toastIdRef.current++}`
        setToasts((prev) => [...prev, { id, message, type }])

        // Auto remove after 3 seconds
        setTimeout(() => {
            removeToast(id)
        }, 3000)
    }

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-30 left-0 right-0 z-[100] pointer-events-none flex flex-col-reverse items-center gap-2 p-4">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                                "pointer-events-auto flex items-center gap-3 px-4 py-3 inset-shadow-sm inset-shadow-white/30 rounded-full shadow-lg min-w-[300px] max-w-[90vw]",
                                toast.type === 'success' && "bg-green-500 text-white",
                                toast.type === 'error' && "bg-red-500 text-white",
                                toast.type === 'info' && "bg-[#0098EA] text-white"
                            )}
                        >
                            <div className="flex-shrink-0">
                                {toast.type === 'success' && <FontAwesomeIcon icon={faCheckCircle} />}
                                {toast.type === 'error' && <FontAwesomeIcon icon={faExclamationCircle} />}
                                {toast.type === 'info' && <FontAwesomeIcon icon={faInfoCircle} />}
                            </div>
                            <p className="flex-1 text-sm font-medium">{toast.message}</p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                            >
                                <FontAwesomeIcon icon={faTimes} className="text-sm" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    )
}
