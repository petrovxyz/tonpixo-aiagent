"use client"

import Image, { ImageProps } from "next/image"
import { useRef, useState, useEffect } from "react"
import { cn } from "@/lib/utils"

type LazyImageProps = ImageProps & {
    wrapperClassName?: string
    wrapperStyle?: React.CSSProperties
    minShimmerMs?: number
}

export function LazyImage({
    wrapperClassName,
    wrapperStyle: externalWrapperStyle,
    className,
    onLoad,
    loading,
    minShimmerMs = 220,
    ...props
}: LazyImageProps) {
    const [loaded, setLoaded] = useState(false)
    const mountTimeRef = useRef<number>(Date.now())
    const timeoutRef = useRef<number | null>(null)
    const isFill = Boolean(props.fill)

    const resolvedLoading = loading ?? (props.priority ? "eager" : "lazy")
    const wrapperBase = isFill ? "absolute inset-0" : "relative block"
    const wrapperStyle: React.CSSProperties = {}

    if (!isFill) {
        if (typeof props.width === "number") {
            wrapperStyle.width = `${props.width}px`
        } else if (typeof props.width === "string") {
            wrapperStyle.width = props.width
        }
        if (typeof props.height === "number") {
            wrapperStyle.height = `${props.height}px`
        } else if (typeof props.height === "string") {
            wrapperStyle.height = props.height
        }
    }

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    return (
        <span
            className={cn("image-frame", wrapperBase, wrapperClassName)}
            data-loaded={loaded ? "true" : "false"}
            aria-busy={!loaded}
            style={{ ...wrapperStyle, ...externalWrapperStyle }}
        >
            <Image
                {...props}
                loading={resolvedLoading}
                className={cn("image-element", className)}
                onLoad={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    if (img.naturalWidth === 0) return
                    const elapsed = Date.now() - mountTimeRef.current
                    const delay = Math.max(0, minShimmerMs - elapsed)
                    timeoutRef.current = window.setTimeout(() => {
                        setLoaded(true)
                    }, delay)
                    onLoad?.(e)
                }}
            />
        </span>
    )
}
