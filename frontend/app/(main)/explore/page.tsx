"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { QABottomSheet, QAItem } from "@/components/QABottomSheet"
import { ImageSlideshow } from "@/components/ImageSlideshow"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faMagnifyingGlass, faArrowUp, faSpinner, faExclamationCircle } from "@fortawesome/free-solid-svg-icons"
import { validateTonAddress } from "@/lib/tonAddress"
import { getAssetUrl } from "@/lib/assetsUrl"

// --- Data ---
const QA_ITEMS: QAItem[] = [
  {
    id: 'what-is-tonpixo',
    question: "What is Tonpixo?",
    answer: 'Tonpixo is an AI-powered agent that turns TON address activity into a natural conversation. Simply interact with data by asking direct questions. Its your personal financial assistant that analyzes blockchain and provides clear, human-readable answers.',
    image: getAssetUrl("images/banner_what_is_tonpixo.webp")
  },
  {
    id: 'how-tonpixo-works',
    question: "How Tonpixo works?",
    answer: "The process is seamless and completely safe. Tonpixo scans the blockchain data to build a knowledge base for the address. Once the data is processed, just start asking questions, and Tonpixo will fetch the specific details, presenting them as easy-to-understand insights.",
    image: getAssetUrl("images/banner_how_it_works.webp")
  },
  {
    id: 'best-practices',
    question: "Best practices",
    answer: "The more specific your prompt, the better the result. Always define clear timeframes, explicitly name the assets you are tracking, and state your desired format. Avoid vague questions. Instead, combine dates, actions, and filters to get desired insights.",
    image: getAssetUrl("images/banner_best_practices.webp")
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
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

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
      const chatId = crypto.randomUUID()
      router.push(`/chat?chat_id=${encodeURIComponent(chatId)}&address=${encodeURIComponent(addressToUse)}`)
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
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const size = Math.max(rect.width, rect.height);

              const ripple = {
                id: Date.now(),
                x,
                y,
                size
              };

              setRipples((prev) => [...prev, ripple]);
            }}
            className={`relative bg-white/10 border-2 rounded-full p-1.5 pl-6 flex items-center transition-all shadow-xl overflow-hidden ${validationError
              ? 'border-red-400/70 hover:border-red-400'
              : 'border-white/20 hover:border-white/40'
              }`}>

            <AnimatePresence>
              {ripples.map((ripple) => (
                <motion.span
                  key={ripple.id}
                  initial={{ scale: 0, opacity: 0.35 }}
                  animate={{ scale: 4, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  onAnimationComplete={() => {
                    setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
                  }}
                  className="absolute bg-white/50 rounded-full pointer-events-none"
                  style={{
                    left: ripple.x,
                    top: ripple.y,
                    width: ripple.size,
                    height: ripple.size,
                    marginLeft: -ripple.size / 2,
                    marginTop: -ripple.size / 2,
                  }}
                />
              ))}
            </AnimatePresence>

            <input
              type="text"
              value={address}
              onChange={handleAddressChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter TON address..."
              disabled={isValidating}
              className="bg-transparent border-none outline-none text-[17px] w-full text-white placeholder:text-white/50 font-medium disabled:opacity-50 z-10"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                startSearch(address);
              }}
              disabled={isValidating}
              className="ml-2 bg-white text-[#0098EA] hover:bg-gray-100 w-12 h-12 rounded-full font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed z-10"
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
              social_icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" id="Telegram-Fill--Streamline-Mingcute-Fill" height="18" width="18">
                <g fillRule="evenodd" fill="none">
                  <path d="M16 0v16H0V0h16ZM8.395333333333333 15.505333333333333l-0.007333333333333332 0.0013333333333333333 -0.047333333333333324 0.023333333333333334 -0.013333333333333332 0.0026666666666666666 -0.009333333333333332 -0.0026666666666666666 -0.047333333333333324 -0.023333333333333334c-0.006666666666666666 -0.0026666666666666666 -0.012666666666666666 -0.0006666666666666666 -0.016 0.003333333333333333l-0.0026666666666666666 0.006666666666666666 -0.011333333333333334 0.2853333333333333 0.003333333333333333 0.013333333333333332 0.006666666666666666 0.008666666666666666 0.06933333333333333 0.049333333333333326 0.009999999999999998 0.0026666666666666666 0.008 -0.0026666666666666666 0.06933333333333333 -0.049333333333333326 0.008 -0.010666666666666666 0.0026666666666666666 -0.011333333333333334 -0.011333333333333334 -0.2846666666666666c-0.0013333333333333333 -0.006666666666666666 -0.005999999999999999 -0.011333333333333334 -0.011333333333333334 -0.011999999999999999Zm0.17666666666666667 -0.07533333333333334 -0.008666666666666666 0.0013333333333333333 -0.12333333333333332 0.062 -0.006666666666666666 0.006666666666666666 -0.002 0.007333333333333332 0.011999999999999999 0.2866666666666666 0.003333333333333333 0.008 0.005333333333333333 0.004666666666666666 0.134 0.062c0.008 0.0026666666666666666 0.015333333333333332 0 0.019333333333333334 -0.005333333333333333l0.0026666666666666666 -0.009333333333333332 -0.02266666666666667 -0.4093333333333333c-0.002 -0.008 -0.006666666666666666 -0.013333333333333332 -0.013333333333333332 -0.014666666666666665Zm-0.4766666666666666 0.0013333333333333333a0.015333333333333332 0.015333333333333332 0 0 0 -0.018 0.004l-0.004 0.009333333333333332 -0.02266666666666667 0.4093333333333333c0 0.008 0.004666666666666666 0.013333333333333332 0.011333333333333334 0.016l0.009999999999999998 -0.0013333333333333333 0.134 -0.062 0.006666666666666666 -0.005333333333333333 0.0026666666666666666 -0.007333333333333332 0.011333333333333334 -0.2866666666666666 -0.002 -0.008 -0.006666666666666666 -0.006666666666666666 -0.12266666666666666 -0.06133333333333333Z" strokeWidth="0.6667"></path>
                  <path fill="#ffffff" d="M13.184666666666667 2.953333333333333a1 1 0 0 1 1.3746666666666665 1.0839999999999999l-1.5119999999999998 9.171333333333333c-0.14666666666666667 0.8846666666666666 -1.1173333333333333 1.392 -1.9286666666666665 0.9513333333333334 -0.6786666666666666 -0.3686666666666667 -1.6866666666666665 -0.9366666666666666 -2.5933333333333333 -1.5293333333333332 -0.45333333333333337 -0.29666666666666663 -1.8419999999999999 -1.2466666666666666 -1.6713333333333333 -1.9226666666666665 0.14666666666666667 -0.578 2.48 -2.75 3.813333333333333 -4.041333333333333 0.5233333333333333 -0.5073333333333333 0.2846666666666666 -0.7999999999999999 -0.3333333333333333 -0.3333333333333333 -1.5346666666666666 1.1586666666666665 -3.998666666666667 2.9206666666666665 -4.813333333333333 3.4166666666666665 -0.7186666666666667 0.43733333333333335 -1.0933333333333333 0.512 -1.5413333333333332 0.43733333333333335 -0.8173333333333332 -0.13599999999999998 -1.5753333333333333 -0.3466666666666667 -2.194 -0.6033333333333333 -0.836 -0.3466666666666667 -0.7953333333333333 -1.496 -0.0006666666666666666 -1.8306666666666667l11.4 -4.8Z" strokeWidth="0.6667"></path>
                </g>
              </svg>}
              text="TG"
              onClick={() => window.open("https://t.me/tonpixo", "_blank")}
            />
            <SuggestionChip
              social_icon={<svg xmlns="http://www.w3.org/2000/svg" fill="#ffffffff" viewBox="0 0 16 16" id="Twitter-X--Streamline-Bootstrap" height="16" width="16">
                <path d="M12.6 0.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867 -5.07 -4.425 5.07H0.316l5.733 -6.57L0 0.75h5.063l3.495 4.633L12.601 0.75Zm-0.86 13.028h1.36L4.323 2.145H2.865z" strokeWidth="1"></path>
              </svg>}
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
