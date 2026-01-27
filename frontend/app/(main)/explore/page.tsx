"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { QABottomSheet, QAItem } from "@/components/QABottomSheet"
import { ImageSlideshow } from "@/components/ImageSlideshow"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faMagnifyingGlass, faArrowUp, faSpinner, faExclamationCircle } from "@fortawesome/free-solid-svg-icons"
import { validateTonAddress, isTonDomain } from "@/lib/tonAddress"

// --- Data ---
const QA_ITEMS: QAItem[] = [
  {
    id: 'what-is-tonpixo',
    question: "What is Tonpixo?",
    answer: 'Tonpixo is an AI-powered agent that turns TON wallet activity into a natural conversation. Simply interact with data by asking direct questions. Its your personal financial assistant that analyzes blockchain history and provides clear, human-readable answers.',
    image: "/images/what_is_tonpixo.webp"
  },
  {
    id: 'how-tonpixo-works',
    question: "How Tonpixo works?",
    answer: "The process is seamless and completely safe. Tonpixo scans the entire transaction history to build a knowledge base for the wallet. Once the data is processed, just start asking questions, and Tonpixo will fetch the specific details, presenting them as easy-to-understand insights.",
    image: "/images/how_it_works.webp"
  }
]

// --- Components ---

const SuggestionChip = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-6 py-4 rounded-3xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-base font-medium transition-all duration-200 transform active:scale-[0.98] flex justify-between items-center group shadow-lg cursor-pointer"
  >
    <span>{text}</span>
    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center transition-all duration-200 group-hover:bg-white/30">
      <FontAwesomeIcon icon={faArrowUp} className="text-[12px] transform rotate-45" />
    </div>
  </button>
)

export default function Home() {
  const router = useRouter()
  const [address, setAddress] = useState("")
  const [activeQA, setActiveQA] = useState<QAItem | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    if (validationError) {
      setValidationError(null)
    }
  }, [validationError])

  const handleAddressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value)
    clearError()
  }, [clearError])

  const startSearch = useCallback(async (targetAddress: string) => {
    const trimmed = targetAddress.trim()

    if (!trimmed) {
      setValidationError("Please enter a TON address")
      return
    }

    setIsValidating(true)
    setValidationError(null)

    try {
      const result = await validateTonAddress(trimmed)

      if (!result.isValid) {
        setValidationError(result.error || "Invalid address")
        setIsValidating(false)
        return
      }

      // Use the normalized address for the chat
      const addressToUse = result.normalizedAddress || trimmed
      router.push(`/chat?address=${encodeURIComponent(addressToUse)}`)
    } catch (err) {
      console.error("Validation error:", err)
      setValidationError("Failed to validate address. Please try again.")
      setIsValidating(false)
    }
  }, [router])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isValidating) {
      startSearch(address)
    }
  }, [address, isValidating, startSearch])

  // Show hint about domain resolution
  const showDomainHint = isTonDomain(address.trim()) && !validationError && !isValidating

  return (
    <div className="relative w-full flex flex-col px-6 max-w-2xl mx-auto flex-1 justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 w-full"
      >
        {/* Slideshow */}
        <ImageSlideshow
          slides={QA_ITEMS.map(item => ({
            id: item.id,
            image: item.image,
            title: item.question,
            description: item.answer
          }))}
          onSlideClick={(index) => setActiveQA(QA_ITEMS[index])}
        />

        {/* Input Area */}
        <div className="w-full max-w-lg relative group">
          <div className="absolute inset-0 bg-white/20 rounded-full transition-all duration-500 opacity-50" />
          <div className={`relative bg-white/10 border-2 rounded-full p-2 pl-6 flex items-center transition-all shadow-xl ${validationError
            ? 'border-red-400/70 hover:border-red-400'
            : 'border-white/20 hover:border-white/40'
            }`}>
            <input
              type="text"
              value={address}
              onChange={handleAddressChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter TON address..."
              disabled={isValidating}
              className="bg-transparent border-none outline-none text-lg w-full text-white placeholder:text-white/50 font-medium disabled:opacity-50"
            />
            <button
              onClick={() => startSearch(address)}
              disabled={isValidating}
              className="ml-2 bg-white text-[#0098EA] hover:bg-gray-100 w-12 h-12 rounded-full font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? (
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              ) : (
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              )}
            </button>
          </div>

          {/* Validation Error Message */}
          <AnimatePresence mode="wait">
            {validationError && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 right-0 mt-2 w-full"
              >
                <div className="flex items-center gap-2 text-red-900/80 text-sm bg-red-500/20 rounded-full px-4 py-2.5 border border-red-900/30">
                  <FontAwesomeIcon icon={faExclamationCircle} className="text-red-900/80 shrink-0" />
                  <span className="line-clamp-2">{validationError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Subscribe Card - add margin top when error is shown */}
        <div className={`flex flex-col gap-3 w-full max-w-lg transition-all duration-200 ${validationError ? 'mt-12' : ''}`}>
          <SuggestionChip
            text="Telegram channel"
            onClick={() => window.open("https://t.me/tonpixo", "_blank")}
          />
        </div>

      </motion.div>

      {/* Q&A Bottom Sheet Modal */}
      <AnimatePresence>
        {activeQA && (
          <QABottomSheet
            item={activeQA}
            onClose={() => setActiveQA(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
