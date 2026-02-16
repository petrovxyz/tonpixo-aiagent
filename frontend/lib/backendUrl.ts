const LOCAL_DEFAULT_API_URL = "http://127.0.0.1:8000"

type RuntimeBackendConfig = {
    apiUrl?: string
    streamUrl?: string
}

declare global {
    interface Window {
        __TONPIXO_BACKEND_CONFIG__?: RuntimeBackendConfig
    }
}

const cleanUrl = (value?: string | null): string | null => {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.replace(/\/+$/, "")
}

const readRuntimeConfig = (): RuntimeBackendConfig => {
    if (typeof window === "undefined") return {}
    return window.__TONPIXO_BACKEND_CONFIG__ || {}
}

export const getApiUrl = (): string => {
    const runtimeApi = cleanUrl(readRuntimeConfig().apiUrl)
    if (runtimeApi) return runtimeApi

    const publicApi = cleanUrl(process.env.NEXT_PUBLIC_API_URL)
    if (publicApi) return publicApi

    return LOCAL_DEFAULT_API_URL
}

export const getStreamUrl = (): string => {
    const runtimeConfig = readRuntimeConfig()

    const runtimeStream = cleanUrl(runtimeConfig.streamUrl)
    if (runtimeStream) return runtimeStream

    const runtimeApi = cleanUrl(runtimeConfig.apiUrl)
    if (runtimeApi) return runtimeApi

    const publicStream = cleanUrl(process.env.NEXT_PUBLIC_STREAM_URL)
    if (publicStream) return publicStream

    const publicApi = cleanUrl(process.env.NEXT_PUBLIC_API_URL)
    if (publicApi) return publicApi

    return LOCAL_DEFAULT_API_URL
}