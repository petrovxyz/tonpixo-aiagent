import { Address } from "@ton/core"

export interface AddressValidationResult {
    isValid: boolean
    normalizedAddress?: string  // Friendly format address if valid
    rawAddress?: string         // Raw format address if valid
    error?: string              // Error message if invalid
    isDomain?: boolean          // True if input was a .ton/.t.me domain
}

const TONAPI_BASE = "https://tonapi.io/v2"

/**
 * Check if input looks like a TON domain (.ton or .t.me)
 */
export function isTonDomain(input: string): boolean {
    const trimmed = input.trim().toLowerCase()
    return trimmed.endsWith('.ton')
}

/**
 * Resolve a .ton or .t.me domain to an address using TonAPI
 */
export async function resolveTonDomain(domain: string): Promise<{ address?: string; error?: string }> {
    try {
        const trimmed = domain.trim().toLowerCase()
        const response = await fetch(`${TONAPI_BASE}/dns/${encodeURIComponent(trimmed)}/resolve`)

        if (!response.ok) {
            if (response.status === 404) {
                return { error: `Domain "${trimmed}" not found` }
            }
            return { error: `Failed to resolve domain: ${response.statusText}` }
        }

        const data = await response.json()

        // Look for wallet address in the resolution result
        if (data.wallet?.address) {
            return { address: data.wallet.address }
        }

        return { error: `Domain "${trimmed}" doesn't have a wallet address` }
    } catch (err) {
        console.error("Domain resolution error:", err)
        return { error: "Failed to resolve domain. Please check your connection." }
    }
}

/**
 * Validate a raw TON address (format: workchain_id:hex_hash)
 * Example: 0:abc123... or -1:fcb91a3a...
 */
export function isValidRawAddress(input: string): boolean {
    const trimmed = input.trim()

    // Must contain exactly one colon
    const parts = trimmed.split(':')
    if (parts.length !== 2) return false

    const [workchain, hash] = parts

    // Workchain must be a valid integer (typically 0 or -1)
    const workchainInt = parseInt(workchain, 10)
    if (isNaN(workchainInt)) return false
    if (workchainInt !== 0 && workchainInt !== -1) return false  // Only basechain (0) or masterchain (-1) are typically used

    // Hash must be exactly 64 hex characters
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) return false

    return true
}

/**
 * Validate a user-friendly TON address
 * Examples: EQB..., UQB..., kQB..., 0QB...
 */
export function isValidFriendlyAddress(input: string): boolean {
    const trimmed = input.trim()

    try {
        // Use @ton/core Address.parse which handles friendly format validation
        Address.parse(trimmed)
        return true
    } catch {
        return false
    }
}

/**
 * Parse and validate any TON address format
 * Supports: raw (0:hex), friendly (EQ.../UQ...), and domains (.ton/.t.me)
 */
export async function validateTonAddress(input: string): Promise<AddressValidationResult> {
    const trimmed = input.trim()

    if (!trimmed) {
        return { isValid: false, error: "Please enter an address" }
    }

    // Check if it's a domain
    if (isTonDomain(trimmed)) {
        const result = await resolveTonDomain(trimmed)
        if (result.error) {
            return { isValid: false, error: result.error, isDomain: true }
        }

        // Validate the resolved address
        try {
            const address = Address.parse(result.address!)
            return {
                isValid: true,
                normalizedAddress: address.toString({ bounceable: false, urlSafe: true }),
                rawAddress: address.toRawString(),
                isDomain: true
            }
        } catch {
            return { isValid: false, error: "Failed to parse resolved address", isDomain: true }
        }
    }

    // Check if it's a raw address
    if (isValidRawAddress(trimmed)) {
        try {
            const address = Address.parseRaw(trimmed)
            return {
                isValid: true,
                normalizedAddress: address.toString({ bounceable: false, urlSafe: true }),
                rawAddress: address.toRawString(),
                isDomain: false
            }
        } catch (err) {
            return { isValid: false, error: "Invalid raw address format", isDomain: false }
        }
    }

    // Try to parse as friendly address
    try {
        const address = Address.parse(trimmed)
        return {
            isValid: true,
            normalizedAddress: address.toString({ bounceable: false, urlSafe: true }),
            rawAddress: address.toRawString(),
            isDomain: false
        }
    } catch {
        // Not a valid address in any format
        return {
            isValid: false,
            error: "Invalid TON address",
            isDomain: false
        }
    }
}

/**
 * Quick synchronous validation (doesn't resolve domains)
 * Returns true only for valid raw or friendly addresses
 */
export function isValidTonAddressSync(input: string): boolean {
    const trimmed = input.trim()

    if (!trimmed) return false

    // Domains need async resolution
    if (isTonDomain(trimmed)) return false

    // Check raw format
    if (isValidRawAddress(trimmed)) {
        try {
            Address.parseRaw(trimmed)
            return true
        } catch {
            return false
        }
    }

    // Try friendly format
    return isValidFriendlyAddress(trimmed)
}
