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
                const { initDataRaw, initData } = retrieveLaunchParams() as any

                if (initData && initData.user) {
                    setInitDataRaw(initDataRaw || null)

                    const telegramUser = initData.user

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
                        await axios.post(`${apiUrl}/api/login`, {
                            initData: initDataRaw
                        })
                    }
                } else {
                    setError("Could not retrieve user data from Telegram.")
                }
            } catch (error) {
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
