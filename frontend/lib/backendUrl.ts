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

type DeployTarget = "dev" | "main" | null

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

const getHostName = (): string => {
    if (typeof window === "undefined") return ""
    return window.location.hostname.toLowerCase()
}

const isLocalHost = (hostname: string): boolean => {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

const detectDeployTarget = (hostname: string): DeployTarget => {
    if (!hostname) return null

    const firstLabel = hostname.split(".")[0]
    if (firstLabel === "dev" || hostname.startsWith("dev-") || hostname.includes("-dev-")) {
        return "dev"
    }
    if (firstLabel === "main" || firstLabel === "prod" || hostname.startsWith("main-")) {
        return "main"
    }

    return null
}

const getMappedApiUrl = (target: DeployTarget): string | null => {
    if (target === "dev") {
        return cleanUrl(process.env.NEXT_PUBLIC_DEV_API_URL || process.env.NEXT_PUBLIC_API_URL_DEV)
    }
    if (target === "main") {
        return cleanUrl(process.env.NEXT_PUBLIC_MAIN_API_URL || process.env.NEXT_PUBLIC_API_URL_MAIN)
    }
    return null
}

const getMappedStreamUrl = (target: DeployTarget): string | null => {
    if (target === "dev") {
        return cleanUrl(process.env.NEXT_PUBLIC_DEV_STREAM_URL || process.env.NEXT_PUBLIC_STREAM_URL_DEV)
    }
    if (target === "main") {
        return cleanUrl(process.env.NEXT_PUBLIC_MAIN_STREAM_URL || process.env.NEXT_PUBLIC_STREAM_URL_MAIN)
    }
    return null
}

export const getApiUrl = (): string => {
    const hostname = getHostName()

    const runtimeApi = cleanUrl(readRuntimeConfig().apiUrl)
    if (runtimeApi) return runtimeApi

    const mappedApi = getMappedApiUrl(detectDeployTarget(hostname))
    if (mappedApi) return mappedApi

    const publicApi = cleanUrl(process.env.NEXT_PUBLIC_API_URL)
    if (publicApi) return publicApi

    if (!isLocalHost(hostname)) return ""

    return LOCAL_DEFAULT_API_URL
}

export const getStreamUrl = (): string => {
    const hostname = getHostName()
    const target = detectDeployTarget(hostname)
    const runtimeConfig = readRuntimeConfig()

    const runtimeStream = cleanUrl(runtimeConfig.streamUrl)
    if (runtimeStream) return runtimeStream

    const runtimeApi = cleanUrl(runtimeConfig.apiUrl)
    if (runtimeApi) return runtimeApi

    const mappedStream = getMappedStreamUrl(target)
    if (mappedStream) return mappedStream

    const mappedApi = getMappedApiUrl(target)
    if (mappedApi) return mappedApi

    const publicStream = cleanUrl(process.env.NEXT_PUBLIC_STREAM_URL)
    if (publicStream) return publicStream

    const publicApi = cleanUrl(process.env.NEXT_PUBLIC_API_URL)
    if (publicApi) return publicApi

    if (!isLocalHost(hostname)) return ""

    return LOCAL_DEFAULT_API_URL
}