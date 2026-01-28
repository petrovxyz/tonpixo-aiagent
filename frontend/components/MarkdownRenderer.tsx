"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExpand, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons'

interface MarkdownRendererProps {
    content: string
    className?: string
    isUserMessage?: boolean
    isStreaming?: boolean
}

import { motion } from 'framer-motion'

export const AnimatedText = ({ children, isAgent, isStreaming }: { children: React.ReactNode; isAgent: boolean; isStreaming?: boolean }) => {
    if (!isAgent || isStreaming) return <>{children}</>

    // Recursive function to wrap text nodes in motion.span
    const wrapWords = (node: React.ReactNode): React.ReactNode => {
        if (typeof node === 'string') {
            const tokens = node.split(/(\s+)/)
            return tokens.map((token, i) => {
                if (token.trim() === '') {
                    return <React.Fragment key={i}>{token}</React.Fragment>
                }
                return (
                    <motion.span
                        key={i}
                        variants={{
                            hidden: { opacity: 0, y: 5 },
                            visible: { opacity: 1, y: 0 }
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="inline-block"
                    >
                        {token}
                    </motion.span>
                )
            })
        }
        if (Array.isArray(node)) {
            return node.map((child, i) => <React.Fragment key={i}>{wrapWords(child)}</React.Fragment>)
        }
        // If it's a React element, we just return it but we don't recurse into it here 
        // because the individual markdown components will handle their own children
        return node
    }

    return <>{wrapWords(children)}</>
}

// Chart Image component for displaying generated charts
function ChartImage({ src }: { src: string }) {
    const [isLoading, setIsLoading] = useState(true)
    const [hasError, setHasError] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    if (hasError) {
        return (
            <div className="my-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-white/70 text-sm">
                Failed to load chart
            </div>
        )
    }

    return (
        <>
            {/* Chart thumbnail - entire area is tappable */}
            <div className="my-3">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="relative w-full overflow-hidden rounded-xl bg-[#0a0a0a] border border-white/10 shadow-lg active:scale-[0.98] transition-transform cursor-pointer"
                    disabled={isLoading}
                >
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-10">
                            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-[#4FC3F7] text-2xl" />
                        </div>
                    )}
                    <img
                        src={src}
                        alt="Chart"
                        className={cn(
                            "w-full h-auto transition-opacity duration-300",
                            isLoading ? "opacity-0" : "opacity-100"
                        )}
                        loading="lazy"
                        onLoad={() => setIsLoading(false)}
                        onError={() => {
                            setIsLoading(false)
                            setHasError(true)
                        }}
                    />
                    {/* Always visible expand indicator */}
                    {!isLoading && (
                        <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full flex items-center gap-1.5 text-white/90 text-xs font-medium">
                            <FontAwesomeIcon icon={faExpand} className="text-[10px]" />
                            <span>Tap to expand</span>
                        </div>
                    )}
                </button>
            </div>

            {/* Fullscreen modal */}
            {isExpanded && isMounted && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
                    onClick={() => setIsExpanded(false)}
                >
                    {/* Close button - large touch target for mobile */}
                    <div className="flex justify-end p-4">
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="w-12 h-12 bg-white/10 active:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                        >
                            <FontAwesomeIcon icon={faTimes} className="text-xl" />
                        </button>
                    </div>

                    {/* Image container with pinch-to-zoom hint */}
                    <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                        <img
                            src={src}
                            alt="Chart"
                            className="max-w-full max-h-full object-contain rounded-xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Tap anywhere hint */}
                    <div className="p-4 text-center text-white/50 text-sm">
                        Tap anywhere to close
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}

// Parse content and extract chart images (deprecated, now using standard markdown images)
function parseChartImages(content: string): { text: string; charts: string[] } {
    const charts: string[] = []
    let text = content

    // 1. Legacy support: [CHART_IMAGE]url[/CHART_IMAGE]
    text = text.replace(/\[CHART_IMAGE\]([\s\S]*?)\[\/CHART_IMAGE\]/g, (match, url) => {
        charts.push(url.trim())
        return ''
    })

    // 2. Standard Markdown support for specific chart tag: ![CHART_VISUALIZATION](url)
    // We Extract this manually to ensure it uses our custom component and isn't affected by parsing issues
    text = text.replace(/!\[CHART_VISUALIZATION\]\(([^)]+)\)/g, (match, url) => {
        charts.push(url.trim())
        return ''
    })

    return { text: text.trim(), charts }
}

export function MarkdownRenderer({ content, className, isUserMessage = false, isStreaming = false }: MarkdownRendererProps) {
    // Parse charts from content
    const { text, charts } = useMemo(() => parseChartImages(content), [content])

    const isAgent = !isUserMessage

    const components = useMemo(() => ({
        // Headings
        h1: ({ children }: any) => (
            <h1 className={cn(
                "text-xl font-bold mb-3 mt-4 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h1>
        ),
        h2: ({ children }: any) => (
            <h2 className={cn(
                "text-lg font-bold mb-2 mt-3 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h2>
        ),
        h3: ({ children }: any) => (
            <h3 className={cn(
                "text-base font-bold mb-2 mt-3 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h3>
        ),
        h4: ({ children }: any) => (
            <h4 className={cn(
                "text-base font-semibold mb-1 mt-2 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h4>
        ),
        h5: ({ children }: any) => (
            <h5 className={cn(
                "text-sm font-semibold mb-1 mt-2 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h5>
        ),
        h6: ({ children }: any) => (
            <h6 className={cn(
                "text-sm font-medium mb-1 mt-2 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white/90"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h6>
        ),

        // Paragraphs
        p: ({ children }: any) => (
            <p className={cn(
                "mb-2 last:mb-0 leading-relaxed",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </p>
        ),

        // Links
        a: ({ href, children }: any) => (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    "underline underline-offset-2 hover:opacity-80 transition-opacity",
                    isUserMessage ? "text-[#0098EA]" : "text-[#4FC3F7]"
                )}
            >
                {children}
            </a>
        ),

        // Bold
        strong: ({ children }: any) => (
            <strong className="font-bold">
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </strong>
        ),

        // Italic
        em: ({ children }: any) => (
            <em className="italic">
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </em>
        ),

        // Strikethrough
        del: ({ children }: any) => (
            <del className="line-through opacity-70">{children}</del>
        ),

        // Inline code
        code: ({ className, children, ...props }: any) => {
            const isInline = !className?.includes('language-')
            if (isInline) {
                return (
                    <code
                        className={cn(
                            "px-1.5 py-0.5 rounded text-sm font-mono",
                            isUserMessage
                                ? "bg-gray-200 text-gray-800"
                                : "bg-white/20 text-white"
                        )}
                        {...props}
                    >
                        {children}
                    </code>
                )
            }
            // Code blocks are handled by the pre component
            return (
                <code className={cn("font-mono text-sm", className)} {...props}>
                    {children}
                </code>
            )
        },

        // Code blocks
        pre: ({ children }: any) => (
            <pre className={cn(
                "my-3 p-4 rounded-xl overflow-x-auto text-sm font-mono",
                isUserMessage
                    ? "bg-gray-100 text-gray-800"
                    : "bg-black/30 text-white/90 border border-white/10"
            )}>
                {children}
            </pre>
        ),

        // Blockquotes
        blockquote: ({ children }: any) => (
            <blockquote className={cn(
                "border-l-4 pl-4 my-3 italic",
                isUserMessage
                    ? "border-gray-300 text-gray-700"
                    : "border-[#4FC3F7]/50 text-white/80"
            )}>
                {children}
            </blockquote>
        ),

        // Unordered lists
        ul: ({ children }: any) => (
            <ul className={cn(
                "list-disc list-inside my-2 space-y-1",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                {children}
            </ul>
        ),

        // Ordered lists
        ol: ({ children }: any) => (
            <ol className={cn(
                "list-decimal list-inside my-2 space-y-1",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                {children}
            </ol>
        ),

        // List items
        li: ({ children }: any) => (
            <li className="leading-relaxed">
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </li>
        ),

        // Horizontal rules
        hr: () => (
            <hr className={cn(
                "my-4 border-t",
                isUserMessage ? "border-gray-300" : "border-white/20"
            )} />
        ),

        // Tables
        table: ({ children }: any) => (
            <div className="my-3 overflow-x-auto rounded-lg">
                <table className={cn(
                    "min-w-full text-sm",
                    isUserMessage ? "text-gray-900" : "text-white"
                )}>
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }: any) => (
            <thead className={cn(
                isUserMessage ? "bg-gray-100" : "bg-white/10"
            )}>
                {children}
            </thead>
        ),
        tbody: ({ children }: any) => (
            <tbody className="divide-y divide-white/10">{children}</tbody>
        ),
        tr: ({ children }: any) => (
            <tr className={cn(
                isUserMessage ? "border-b border-gray-200" : "border-b border-white/10"
            )}>
                {children}
            </tr>
        ),
        th: ({ children }: any) => (
            <th className="px-3 py-2 text-left font-semibold">{children}</th>
        ),
        td: ({ children }: any) => (
            <td className="px-3 py-2">{children}</td>
        ),

        // Images - Custom handler for Charts
        img: ({ src, alt }: any) => {
            const imgSrc = src as string || '';
            // Check for chart visualization either by specific alt text or URL pattern
            const isChart = alt === 'CHART_VISUALIZATION' ||
                imgSrc.includes('/charts/') ||
                imgSrc.includes('charts%2F');

            if (isChart && imgSrc) {
                return <ChartImage src={imgSrc} />
            }
            return (
                <img
                    src={imgSrc}
                    alt={alt || ''}
                    className="max-w-full h-auto rounded-lg my-3"
                    loading="lazy"
                />
            )
        },
    }), [isUserMessage, isAgent, isStreaming])

    return (
        <div
            className={cn(
                "markdown-content",
                "[overflow-wrap:break-word] [word-break:keep-all]",
                className
            )}
        >
            {/* Render charts */}
            {charts.map((chartUrl, index) => (
                <ChartImage key={`chart-${index}`} src={chartUrl} />
            ))}

            {/* Render markdown text */}
            {text && (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={components}
                >
                    {text}
                </ReactMarkdown>
            )}
        </div>
    )
}
