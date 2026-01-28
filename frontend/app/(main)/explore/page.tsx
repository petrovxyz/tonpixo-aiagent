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

const SuggestionChip = ({ text, onClick, social_icon }: { text: string; onClick: () => void; social_icon: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-4 py-2 rounded-3xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium transition-all duration-200 transform active:scale-[0.98] flex justify-between items-center group shadow-lg cursor-pointer"
  >
    <div className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200">
      {social_icon}
    </div>
    <span className="text-sm">{text}</span>
    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center transition-all duration-200 group-hover:bg-white/30">
      <FontAwesomeIcon icon={faArrowUp} className="text-[10px] transform rotate-45" />
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
                  <span className="line-clamp-2 font-medium">{validationError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Subscribe Card - add margin top when error is shown */}
        <div className={`flex flex-col bg-white/10 p-3 rounded-3xl gap-2 w-full max-w-lg transition-all duration-200 ${validationError ? 'mt-12' : ''}`}>
          <span className="px-2 text-white font-medium text-sm">Follow Tonpixo updates!</span>
          <div className="flex flex-row gap-3">
            <SuggestionChip
              social_icon={<svg xmlns="http://www.w3.org/2000/svg" fill="#ffffffff" width="800px" height="800px" viewBox="0 0 32 32" version="1.1">
                <path d="M22.122 10.040c0.006-0 0.014-0 0.022-0 0.209 0 0.403 0.065 0.562 0.177l-0.003-0.002c0.116 0.101 0.194 0.243 0.213 0.403l0 0.003c0.020 0.122 0.031 0.262 0.031 0.405 0 0.065-0.002 0.129-0.007 0.193l0-0.009c-0.225 2.369-1.201 8.114-1.697 10.766-0.21 1.123-0.623 1.499-1.023 1.535-0.869 0.081-1.529-0.574-2.371-1.126-1.318-0.865-2.063-1.403-3.342-2.246-1.479-0.973-0.52-1.51 0.322-2.384 0.221-0.23 4.052-3.715 4.127-4.031 0.004-0.019 0.006-0.040 0.006-0.062 0-0.078-0.029-0.149-0.076-0.203l0 0c-0.052-0.034-0.117-0.053-0.185-0.053-0.045 0-0.088 0.009-0.128 0.024l0.002-0.001q-0.198 0.045-6.316 4.174c-0.445 0.351-1.007 0.573-1.619 0.599l-0.006 0c-0.867-0.105-1.654-0.298-2.401-0.573l0.074 0.024c-0.938-0.306-1.683-0.467-1.619-0.985q0.051-0.404 1.114-0.827 6.548-2.853 8.733-3.761c1.607-0.853 3.47-1.555 5.429-2.010l0.157-0.031zM15.93 1.025c-8.302 0.020-15.025 6.755-15.025 15.060 0 8.317 6.742 15.060 15.060 15.060s15.060-6.742 15.060-15.060c0-8.305-6.723-15.040-15.023-15.060h-0.002q-0.035-0-0.070 0z" />
              </svg>}
              text="TG"
              onClick={() => window.open("https://t.me/tonpixo", "_blank")}
            />
            <SuggestionChip
              social_icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="-480 -466.815 2160 2160"><circle fill="#ffffffff" cx="600" cy="613.185" r="1080" /><path fill="#64c6f9" d="M306.615 79.694H144.011L892.476 1150.3h162.604ZM0 0h357.328l309.814 450.883L1055.03 0h105.86L714.15 519.295 1200 1226.37H842.672L515.493 750.215 105.866 1226.37H0l468.485-544.568Z" /></svg>}
              text="X"
              onClick={() => window.open("https://x.com/tonpixo", "_blank")}
            />
          </div>
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
