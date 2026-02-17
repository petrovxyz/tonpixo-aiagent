import axios from "axios"
import { getApiUrl } from "@/lib/backendUrl"
import type { StoredHistoryMessage } from "./bootstrapUtils"

export interface ChatMetadata {
    error?: string
    job_id?: string
    address?: string
}

export interface ChatHistoryPayload {
    error?: string
    messages?: StoredHistoryMessage[]
}

export interface SaveChatMessagePayload {
    role: "user" | "agent"
    content: string
    trace_id?: string
    idempotency_key?: string
}

export const fetchChatBootstrap = async (chatId: string, userId: number) => {
    const apiUrl = getApiUrl()
    const [metaResponse, historyResponse] = await Promise.all([
        axios.get<ChatMetadata>(`${apiUrl}/api/chat/${chatId}`, {
            params: { user_id: userId }
        }),
        axios.get<ChatHistoryPayload>(`${apiUrl}/api/chat/${chatId}/history`, {
            params: { user_id: userId }
        })
    ])

    return {
        meta: metaResponse.data,
        history: historyResponse.data
    }
}

export const initChat = async (params: {
    chatId: string
    userId: number
    title: string
    address: string
}) => {
    const apiUrl = getApiUrl()
    await axios.post(`${apiUrl}/api/chat/init`, {
        chat_id: params.chatId,
        user_id: params.userId,
        title: params.title,
        address: params.address
    })
}

export const saveChatMessage = async (chatId: string, payload: SaveChatMessagePayload) => {
    const apiUrl = getApiUrl()
    await axios.post(`${apiUrl}/api/chat/${chatId}/message`, payload)
}

export const requestAccountSummary = async (address: string) => {
    const apiUrl = getApiUrl()
    return axios.post(`${apiUrl}/api/account_summary`, { address })
}

