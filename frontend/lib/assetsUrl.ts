import type { RuntimeBackendConfig } from "./runtimeConfig"


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

export const getAssetsBaseUrl = (): string => {
    const runtimeBase = cleanUrl(readRuntimeConfig().assetsBaseUrl)
    if (runtimeBase) return runtimeBase

    const envBase = cleanUrl(process.env.NEXT_PUBLIC_ASSETS_BASE_URL)
    if (envBase) return envBase

    return ""
}

export const getAssetUrl = (path: string): string => {
    const base = getAssetsBaseUrl()
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path

    if (!base) {
        if (typeof window !== "undefined") {
            console.warn("Assets base URL is not configured. Set NEXT_PUBLIC_ASSETS_BASE_URL.")
        }
        return `/${normalizedPath}`
    }

    return `${base}/${normalizedPath}`
}