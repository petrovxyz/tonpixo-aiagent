"use client"

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExpand, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons'

interface MarkdownRendererProps {
    content: string
    className?: string
    isUserMessage?: boolean
}

// Chart Image component for displaying generated charts
function ChartImage({ src }: { src: string }) {
    const [isLoading, setIsLoading] = useState(true)
    const [hasError, setHasError] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

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
            {isExpanded && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex flex-col"
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
                </div>
            )}
        </>
    )
}

// Parse content and extract chart images (deprecated, now using standard markdown images)
function parseChartImages(content: string): { text: string; charts: string[] } {
    // Legacy support for older messages
    const chartRegex = /\[CHART_IMAGE\]([\s\S]*?)\[\/CHART_IMAGE\]/g
    const charts: string[] = []
    let match

    while ((match = chartRegex.exec(content)) !== null) {
        charts.push(match[1].trim())
    }

    // Remove chart markers from text
    const text = content.replace(chartRegex, '').trim()

    return { text, charts }
}

export function MarkdownRenderer({ content, className, isUserMessage = false }: MarkdownRendererProps) {
    // Parse legacy charts from content
    const { text, charts } = useMemo(() => parseChartImages(content), [content])

    return (
        <div className={cn(
            "markdown-content",
            "[overflow-wrap:break-word] [word-break:keep-all]",
            className
        )}>
            {/* Render legacy charts first */}
            {charts.map((chartUrl, index) => (
                <ChartImage key={`chart-legacy-${index}`} src={chartUrl} />
            ))}

            {/* Render markdown text */}
            {text && (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        // Headings
                        h1: ({ children }) => (
                            <h1 className={cn(
                                "text-xl font-bold mb-3 mt-4 first:mt-0",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </h1>
                        ),
                        h2: ({ children }) => (
                            <h2 className={cn(
                                "text-lg font-bold mb-2 mt-3 first:mt-0",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </h2>
                        ),
                        h3: ({ children }) => (
                            <h3 className={cn(
                                "text-base font-bold mb-2 mt-3 first:mt-0",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </h3>
                        ),
                        h4: ({ children }) => (
                            <h4 className={cn(
                                "text-base font-semibold mb-1 mt-2 first:mt-0",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </h4>
                        ),
                        h5: ({ children }) => (
                            <h5 className={cn(
                                "text-sm font-semibold mb-1 mt-2 first:mt-0",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </h5>
                        ),
                        h6: ({ children }) => (
                            <h6 className={cn(
                                "text-sm font-medium mb-1 mt-2 first:mt-0",
                                isUserMessage ? "text-gray-900" : "text-white/90"
                            )}>
                                {children}
                            </h6>
                        ),

                        // Paragraphs
                        p: ({ children }) => (
                            <p className={cn(
                                "mb-2 last:mb-0 leading-relaxed",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </p>
                        ),

                        // Links
                        a: ({ href, children }) => (
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
                        strong: ({ children }) => (
                            <strong className="font-bold">{children}</strong>
                        ),

                        // Italic
                        em: ({ children }) => (
                            <em className="italic">{children}</em>
                        ),

                        // Strikethrough
                        del: ({ children }) => (
                            <del className="line-through opacity-70">{children}</del>
                        ),

                        // Inline code
                        code: ({ className, children, ...props }) => {
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
                        pre: ({ children }) => (
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
                        blockquote: ({ children }) => (
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
                        ul: ({ children }) => (
                            <ul className={cn(
                                "list-disc list-inside my-2 space-y-1",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </ul>
                        ),

                        // Ordered lists
                        ol: ({ children }) => (
                            <ol className={cn(
                                "list-decimal list-inside my-2 space-y-1",
                                isUserMessage ? "text-gray-900" : "text-white"
                            )}>
                                {children}
                            </ol>
                        ),

                        // List items
                        li: ({ children }) => (
                            <li className="leading-relaxed">{children}</li>
                        ),

                        // Horizontal rules
                        hr: () => (
                            <hr className={cn(
                                "my-4 border-t",
                                isUserMessage ? "border-gray-300" : "border-white/20"
                            )} />
                        ),

                        // Tables
                        table: ({ children }) => (
                            <div className="my-3 overflow-x-auto rounded-lg">
                                <table className={cn(
                                    "min-w-full text-sm",
                                    isUserMessage ? "text-gray-900" : "text-white"
                                )}>
                                    {children}
                                </table>
                            </div>
                        ),
                        thead: ({ children }) => (
                            <thead className={cn(
                                isUserMessage ? "bg-gray-100" : "bg-white/10"
                            )}>
                                {children}
                            </thead>
                        ),
                        tbody: ({ children }) => (
                            <tbody className="divide-y divide-white/10">{children}</tbody>
                        ),
                        tr: ({ children }) => (
                            <tr className={cn(
                                isUserMessage ? "border-b border-gray-200" : "border-b border-white/10"
                            )}>
                                {children}
                            </tr>
                        ),
                        th: ({ children }) => (
                            <th className="px-3 py-2 text-left font-semibold">{children}</th>
                        ),
                        td: ({ children }) => (
                            <td className="px-3 py-2">{children}</td>
                        ),

                        // Images - Custom handler for Charts
                        img: ({ src, alt }) => {
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
                    }}
                >
                    {text}
                </ReactMarkdown>
            )}
        </div>
    )
}
