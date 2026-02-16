/**
 * Unified runtime backend configuration type.
 *
 * This is the single source of truth for the shape of
 * `window.__TONPIXO_BACKEND_CONFIG__`, which is injected at SSR time
 * by `app/layout.tsx`.
 */
export type RuntimeBackendConfig = {
    apiUrl?: string
    streamUrl?: string
    assetsBaseUrl?: string
}

declare global {
    interface Window {
        __TONPIXO_BACKEND_CONFIG__?: RuntimeBackendConfig
    }
}
