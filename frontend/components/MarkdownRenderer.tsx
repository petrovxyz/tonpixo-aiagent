"use client"

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
    content: string
    className?: string
    isUserMessage?: boolean
}

export function MarkdownRenderer({ content, className, isUserMessage = false }: MarkdownRendererProps) {
    return (
        <div className={cn(
            "markdown-content",
            "[overflow-wrap:break-word] [word-break:keep-all]",
            className
        )}>
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

                    // Images
                    img: ({ src, alt }) => (
                        <img
                            src={src}
                            alt={alt || ''}
                            className="max-w-full h-auto rounded-lg my-3"
                            loading="lazy"
                        />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}
