import type { AddressDetailsData } from "./types"

interface AccountSummaryResponse {
    error?: string
    address: string
    status: string
    is_wallet: boolean
    interfaces: string[]
    last_activity: number
    balance: number
    is_scam: boolean
}

export const buildErrorAddressDetails = (address: string): AddressDetailsData => ({
    type: "address_details",
    address,
    hasError: true
})

export const buildAddressDetailsFromSummary = (
    address: string,
    summary: AccountSummaryResponse
): AddressDetailsData => {
    const lastActivity = new Date(summary.last_activity * 1000).toUTCString().replace(" GMT", "")
    const balance = (summary.balance / 1000000000).toFixed(2)

    return {
        type: "address_details",
        address,
        rawAddress: summary.address,
        status: summary.status,
        isWallet: summary.is_wallet,
        interfaces: summary.interfaces,
        lastActivity,
        balance,
        isScam: summary.is_scam,
        hasError: false
    }
}

