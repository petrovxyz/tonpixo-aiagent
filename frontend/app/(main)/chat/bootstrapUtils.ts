import type { ReactNode } from "react"
import type { Message } from "./types"

export interface StoredHistoryMessage {
    message_id?: string
    role: "user" | "agent"
    content: string
    created_at: string
    trace_id?: string
}

export interface ParsedStoredMessage {
    content: ReactNode
    isSystemMessage: boolean
}

export const removeTransientMessages = (messages: Message[]): Message[] =>
    messages.filter(m => m.content !== "collecting" && m.content !== "thinking")

export const appendMessage = (messages: Message[], message: Message): Message[] => {
    const base = removeTransientMessages(messages)
    if (!message.metaKey) return [...base, message]
    return [...base.filter(m => m.metaKey !== message.metaKey), message]
}

export const buildChatRoute = (chatId: string, address?: string | null): string => {
    const params = new URLSearchParams()
    params.set("chat_id", chatId)
    if (address) {
        params.set("address", address)
    }
    return `/chat?${params.toString()}`
}

export const mapStoredHistoryToMessages = (
    historyMessages: StoredHistoryMessage[],
    parseStoredMessage: (content: string) => ParsedStoredMessage
): Message[] =>
    historyMessages.map((msg) => {
        const parsed = parseStoredMessage(msg.content)
        return {
            id: msg.message_id || Math.random().toString(36),
            role: msg.role,
            content: parsed.content,
            timestamp: new Date(msg.created_at),
            traceId: msg.trace_id,
            isSystemMessage: parsed.isSystemMessage
        }
    })

export const getAddressBootstrapState = (historyMessages: StoredHistoryMessage[], address: string) => {
    const searchPrompt = `Search: ${address}`
    const hasSearchPrompt = historyMessages.some(
        msg => msg.role === "user" && msg.content.trim() === searchPrompt
    )

    const hasAddressDetails = historyMessages.some((msg) => {
        if (msg.role !== "agent") return false
        try {
            const parsed = JSON.parse(msg.content) as { type?: string; address?: string }
            return parsed.type === "address_details" && parsed.address === address
        } catch {
            return false
        }
    })

    return {
        hasSearchPrompt,
        hasAddressDetails,
        shouldBootstrap: !hasAddressDetails,
        persistSearchMessage: !hasSearchPrompt
    }
}

export const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    baseDelayMs = 400
): Promise<T> => {
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await operation()
        } catch (error) {
            lastError = error
            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, baseDelayMs * (attempt + 1)))
            }
        }
    }

    throw lastError
}

