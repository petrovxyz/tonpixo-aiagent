"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion"
import Image from "next/image"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowUp } from "@fortawesome/free-solid-svg-icons"

type Slide = {
    id: string
    image: string
    title: string
    description?: string
}

const SLIDE_DURATION = 5000 // 5 seconds per slide

export function ImageSlideshow({ slides, onSlideClick }: { slides: Slide[], onSlideClick?: (index: number) => void }) {
    const [index, setIndex] = useState(0)
    const [direction, setDirection] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([])

    // Auto-advance
    useEffect(() => {
        if (isDragging || isTransitioning) return

        const timer = setInterval(() => {
            nextSlide()
        }, SLIDE_DURATION)

        return () => clearInterval(timer)
    }, [index, isDragging, isTransitioning])

    const nextSlide = useCallback(() => {
        if (isTransitioning) return
        setIsTransitioning(true)
        setDirection(1)
        setIndex((prev) => (prev + 1) % slides.length)
        setTimeout(() => setIsTransitioning(false), 1000) // Cooldown period
    }, [slides.length, isTransitioning])

    const prevSlide = useCallback(() => {
        if (isTransitioning) return
        setIsTransitioning(true)
        setDirection(-1)
        setIndex((prev) => (prev - 1 + slides.length) % slides.length)
        setTimeout(() => setIsTransitioning(false), 1000) // Cooldown period
    }, [slides.length, isTransitioning])

    const handlePanStart = () => {
        // Don't allow dragging during transition
        if (isTransitioning) return
        setIsDragging(true)
    }

    const handlePanEnd = (e: any, { offset, velocity }: PanInfo) => {
        // Don't process if we never started dragging (was blocked during transition)
        if (!isDragging) return

        setIsDragging(false)

        // Prevent swipe if already transitioning
        if (isTransitioning) return

        const swipeThreshold = 50
        const velocityThreshold = 0.2

        if (offset.x < -swipeThreshold || velocity.x < -velocityThreshold) {
            nextSlide()
        } else if (offset.x > swipeThreshold || velocity.x > velocityThreshold) {
            prevSlide()
        }
    }

    const variants = {
        enter: (direction: number) => ({
            opacity: 0,
            x: 0,
            zIndex: 1
        }),
        center: {
            opacity: 1,
            x: 0,
            zIndex: 1,
            transition: {
                opacity: { duration: 0.8, ease: "easeInOut" as const }
            }
        },
        exit: (direction: number) => ({
            opacity: 0,
            x: 0,
            zIndex: 0,
            transition: {
                opacity: { duration: 0.8, ease: "easeInOut" as const }
            }
        })
    }

    return (
        <div className="relative w-full aspect-[16/9] overflow-hidden rounded-3xl group isolate touch-pan-y cursor-grab">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                    key={slides[index].id}
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    onPanStart={handlePanStart}
                    onPanEnd={handlePanEnd}
                    className="absolute inset-0 w-full h-full bg-black/5"
                >
                    <div className="relative w-full h-full">
                        <Image
                            src={slides[index].image}
                            alt={slides[index].title}
                            fill
                            className="object-cover"
                            priority
                            draggable={false}
                        />

                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                        {/* Content */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-start gap-2 pointer-events-none select-none">
                            <motion.button
                                initial={{ opacity: 0, y: 70 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
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
                                    onSlideClick?.(index);
                                }}
                                className="relative pointer-events-auto w-full flex items-center gap-3 text-white text-[18px] font-semibold tracking-tight bg-[#0098EA]/90 hover:bg-[#0088CC]/90 active:scale-95 transition-all duration-200 rounded-full px-5 py-2 cursor-pointer overflow-hidden"
                            >
                                <AnimatePresence>
                                    {ripples.map((ripple) => (
                                        <motion.span
                                            key={ripple.id}
                                            initial={{ scale: 0, opacity: 0.35 }}
                                            animate={{ scale: 4, opacity: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.6, ease: "easeOut" }}
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
                                <span className="relative z-10 flex items-center gap-3 w-full">
                                    <span>{slides[index].title}</span>
                                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center ml-auto">
                                        <FontAwesomeIcon icon={faArrowUp} className="text-[10px] transform rotate-45" />
                                    </div>
                                </span>
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Progress Indicators */}
            <div className="absolute top-4 left-4 right-4 flex gap-2 z-10 pointer-events-none">
                {slides.map((slide, i) => (
                    <div key={slide.id} className="h-1 flex-1 bg-black/10 rounded-full overflow-hidden">
                        <AnimatePresence mode="wait">
                            {i === index && !isDragging && (
                                <motion.div
                                    key={`progress-${slide.id}-${index}`}
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    exit={{ width: "0%", transition: { duration: 0 } }}
                                    transition={{
                                        duration: SLIDE_DURATION / 1000,
                                        ease: "linear",
                                        delay: 0
                                    }}
                                    className="h-full bg-white rounded-full"
                                />
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </div>
    )
}
