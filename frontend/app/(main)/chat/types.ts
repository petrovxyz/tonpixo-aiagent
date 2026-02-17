import type { ReactNode } from "react"

export interface Message {
    id: string
    role: "user" | "agent"
    content: ReactNode
    timestamp: Date
    isStreaming?: boolean
    streamingText?: string
    thinkingText?: string
    isAnalyzing?: boolean
    traceId?: string
    isSystemMessage?: boolean
    metaKey?: string
}

export interface AddressDetailsData {
    type: "address_details"
    address: string
    rawAddress?: string
    status?: string
    isWallet?: boolean
    interfaces?: string[]
    lastActivity?: string
    balance?: string
    isScam?: boolean
    hasError?: boolean
}

export interface AddressBootstrapOptions {
    persistSearchMessage?: boolean
    source?: "auto" | "manual"
}
