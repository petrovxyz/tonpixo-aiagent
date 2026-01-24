"use client"

import React, { createContext, useContext, useState } from "react"

interface UIContextType {
    isOverlayOpen: boolean
    setIsOverlayOpen: (open: boolean) => void
    isInitialLoading: boolean
    setIsInitialLoading: (loading: boolean) => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
    const [isOverlayOpen, setIsOverlayOpen] = useState(false)
    const [isInitialLoading, setIsInitialLoading] = useState(true)

    return (
        <UIContext.Provider value={{
            isOverlayOpen,
            setIsOverlayOpen,
            isInitialLoading,
            setIsInitialLoading
        }}>
            {children}
        </UIContext.Provider>
    )
}

export function useUI() {
    const context = useContext(UIContext)
    if (context === undefined) {
        throw new Error("useUI must be used within a UIProvider")
    }
    return context
}
