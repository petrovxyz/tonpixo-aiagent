"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { retrieveLaunchParams } from "@tma.js/sdk"
import axios from "axios"

interface TelegramUser {
    id: number
    first_name: string
    last_name?: string
    username?: string
    language_code?: string
    photo_url?: string
}

interface TelegramContextType {
    user: TelegramUser | null
    initDataRaw: string | null
    isLoading: boolean
    error: string | null
    login: () => Promise<void>
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined)

export function TelegramProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<TelegramUser | null>(null)
    const [initDataRaw, setInitDataRaw] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const login = async () => {
        if (!initDataRaw) return

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
            await axios.post(`${apiUrl}/api/login`, {
                initData: initDataRaw
            })
        } catch (error) {
            console.error("Login failed:", error)
        }
    }

    useEffect(() => {
        const init = async () => {
            setIsLoading(true)
            try {
                console.log("[TG] Initializing Telegram context...")
                const { initDataRaw, initData } = retrieveLaunchParams() as any

                console.log("[TG] initDataRaw:", initDataRaw ? "present" : "missing")
                console.log("[TG] initData:", initData ? "present" : "missing")

                if (initData && initData.user) {
                    setInitDataRaw(initDataRaw || null)

                    const telegramUser = initData.user
                    console.log("[TG] User from Telegram:", telegramUser)

                    setUser({
                        id: telegramUser.id,
                        first_name: telegramUser.firstName,
                        last_name: telegramUser.lastName,
                        username: telegramUser.username,
                        language_code: telegramUser.languageCode,
                        photo_url: telegramUser.photoUrl
                    })

                    if (initDataRaw) {
                        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
                        console.log("[TG] Sending login request to:", `${apiUrl}/api/login`)

                        try {
                            const response = await axios.post(`${apiUrl}/api/login`, {
                                initData: initDataRaw
                            }, {
                                timeout: 10000, // 10 second timeout
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })
                            console.log("[TG] Login response:", response.data)

                            if (response.data.status === "error") {
                                console.error("[TG] Login failed:", response.data.message)
                                setError(`Login failed: ${response.data.message}`)
                            }
                        } catch (loginError: any) {
                            console.error("[TG] Login request failed:", loginError)

                            if (loginError.code === 'ECONNABORTED') {
                                setError("Connection timeout. Please check your network connection.")
                            } else if (loginError.response) {
                                // Server responded with error
                                setError(`Server error: ${loginError.response.status} - ${loginError.response.data?.message || loginError.message}`)
                            } else if (loginError.request) {
                                // Request made but no response
                                setError("No response from server. Please check if the backend is running.")
                            } else {
                                // Other errors
                                setError(`Connection failed: ${loginError.message}`)
                            }
                        }
                    }
                } else {
                    // No user data - use mock in development, show error in production
                    console.warn("[TG] No user data in initData")

                    if (process.env.NODE_ENV === "development") {
                        console.warn("[TG] Using mock data for development (no Telegram environment)")
                        const mockUser: TelegramUser = {
                            id: 123456789,
                            first_name: "Test",
                            last_name: "User",
                            username: "testuser",
                            language_code: "en",
                            photo_url: "https://placehold.co/100x100"
                        }
                        setUser(mockUser)
                        setInitDataRaw("query_id=mock&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Test%22%7D")
                    } else {
                        setError("Could not retrieve user data from Telegram.")
                    }
                }
            } catch (error: any) {
                console.error("[TG] Initialization error:", error)

                if (process.env.NODE_ENV === "development") {
                    console.warn("Telegram environment not detected. Using mock data for development.")
                    const mockUser: TelegramUser = {
                        id: 123456789,
                        first_name: "Test",
                        last_name: "User",
                        username: "testuser",
                        language_code: "en",
                        photo_url: "https://placehold.co/100x100"
                    }
                    setUser(mockUser)
                    setInitDataRaw("query_id=mock&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Test%22%7D")
                } else {
                    console.error("Telegram environment not detected:", error)
                    setError("This application is only available as a Telegram Mini App.")
                }
            } finally {
                setIsLoading(false)
            }
        }

        init()
    }, [])

    return (
        <TelegramContext.Provider value={{
            user,
            initDataRaw,
            isLoading,
            error,
            login
        }}>
            {children}
        </TelegramContext.Provider>
    )
}

export function useTelegram() {
    const context = useContext(TelegramContext)
    if (context === undefined) {
        throw new Error("useTelegram must be used within a TelegramProvider")
    }
    return context
}
