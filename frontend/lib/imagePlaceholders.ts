const DEFAULT_BLUR_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAI0lEQVQoU2P8/5+hH4KBgYGJgYGBgQEGABr6A5zCkKpMAAAAAElFTkSuQmCC";

const getRuntimeAssetsBaseUrl = (): string => {
    if (typeof window !== "undefined") {
        const runtime = window.__TONPIXO_BACKEND_CONFIG__ as { assetsBaseUrl?: string } | undefined
        if (runtime?.assetsBaseUrl) return runtime.assetsBaseUrl
    }
    return process.env.NEXT_PUBLIC_ASSETS_BASE_URL || ""
}

export const getBlurDataURL = (src?: string | null): string => {
    if (!src) return DEFAULT_BLUR_DATA_URL
    const baseUrl = getRuntimeAssetsBaseUrl().replace(/\/+$/, "")
    if (!baseUrl || !src.startsWith(baseUrl)) return DEFAULT_BLUR_DATA_URL

    const encoded = encodeURIComponent(src)
    return `/_next/image?url=${encoded}&w=16&q=30`
}

export { DEFAULT_BLUR_DATA_URL }