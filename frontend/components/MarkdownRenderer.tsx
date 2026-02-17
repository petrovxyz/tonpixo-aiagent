"use client"

import React, { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { ChartRenderer } from './ChartRenderer'
import { LazyImage } from "@/components/LazyImage"

interface MarkdownRendererProps {
    content: string
    className?: string
    isUserMessage?: boolean
    isStreaming?: boolean
}

type HeadingProps = React.ComponentPropsWithoutRef<'h1'> & { node?: unknown }
type ParagraphProps = React.ComponentPropsWithoutRef<'p'> & { node?: unknown }
type AnchorProps = React.ComponentPropsWithoutRef<'a'> & { node?: unknown }
type StrongProps = React.ComponentPropsWithoutRef<'strong'> & { node?: unknown }
type EmProps = React.ComponentPropsWithoutRef<'em'> & { node?: unknown }
type DelProps = React.ComponentPropsWithoutRef<'del'> & { node?: unknown }
type CodeProps = React.ComponentPropsWithoutRef<'code'> & { node?: unknown }
type PreProps = React.ComponentPropsWithoutRef<'pre'> & { node?: unknown }
type BlockquoteProps = React.ComponentPropsWithoutRef<'blockquote'> & { node?: unknown }
type UlProps = React.ComponentPropsWithoutRef<'ul'> & { node?: unknown }
type OlProps = React.ComponentPropsWithoutRef<'ol'> & { node?: unknown }
type LiProps = React.ComponentPropsWithoutRef<'li'> & { node?: unknown }
type TableProps = React.ComponentPropsWithoutRef<'table'> & { node?: unknown }
type TheadProps = React.ComponentPropsWithoutRef<'thead'> & { node?: unknown }
type TbodyProps = React.ComponentPropsWithoutRef<'tbody'> & { node?: unknown }
type TrProps = React.ComponentPropsWithoutRef<'tr'> & { node?: unknown }
type ThProps = React.ComponentPropsWithoutRef<'th'> & { node?: unknown }
type TdProps = React.ComponentPropsWithoutRef<'td'> & { node?: unknown }
type ImgProps = React.ComponentPropsWithoutRef<'img'> & { node?: unknown }

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
                        className="inline-block max-w-full break-words [overflow-wrap:anywhere]"
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

export function MarkdownRenderer({ content, className, isUserMessage = false, isStreaming = false }: MarkdownRendererProps) {
    const isAgent = !isUserMessage

    const components = useMemo<Components>(() => ({
        // Headings
        h1: ({ children }: HeadingProps) => (
            <h1 className={cn(
                "text-xl font-bold mb-3 mt-4 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h1>
        ),
        h2: ({ children }: HeadingProps) => (
            <h2 className={cn(
                "text-lg font-bold mb-2 mt-3 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h2>
        ),
        h3: ({ children }: HeadingProps) => (
            <h3 className={cn(
                "text-base font-bold mb-2 mt-3 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h3>
        ),
        h4: ({ children }: HeadingProps) => (
            <h4 className={cn(
                "text-base font-semibold mb-1 mt-2 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h4>
        ),
        h5: ({ children }: HeadingProps) => (
            <h5 className={cn(
                "text-sm font-semibold mb-1 mt-2 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h5>
        ),
        h6: ({ children }: HeadingProps) => (
            <h6 className={cn(
                "text-sm font-medium mb-1 mt-2 first:mt-0",
                isUserMessage ? "text-gray-900" : "text-white/90"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </h6>
        ),

        // Paragraphs
        p: ({ children }: ParagraphProps) => (
            <p className={cn(
                "mb-2 last:mb-0 leading-relaxed",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </p>
        ),

        // Links
        a: ({ href, children }: AnchorProps) => (
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
        strong: ({ children }: StrongProps) => (
            <strong className="font-bold">
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </strong>
        ),

        // Italic
        em: ({ children }: EmProps) => (
            <em className="italic">
                <AnimatedText isAgent={isAgent} isStreaming={isStreaming}>{children}</AnimatedText>
            </em>
        ),

        // Strikethrough
        del: ({ children }: DelProps) => (
            <del className="line-through opacity-70">{children}</del>
        ),

        // Inline code
        code: ({ className, children, ...props }: CodeProps) => {
            const isInline = !className?.includes('language-')

            // Check for chart JSON block
            if (!isInline && className?.includes('language-json:chart')) {
                try {
                    const content = String(children).replace(/\n$/, '');
                    const chartConfig = JSON.parse(content);
                    return <ChartRenderer config={chartConfig} />;
                } catch (e) {
                    console.error("Failed to parse chart JSON", e);
                    // Fallback to regular code block if parsing fails
                }
            }

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

            return (
                <code className={cn("font-mono text-sm", className)} {...props}>
                    {children}
                </code>
            )
        },

        // Code blocks
        pre: ({ children }: PreProps) => {
            return (
                <pre className={cn(
                    "my-3 p-4 rounded-xl overflow-x-auto text-sm font-mono",
                    isUserMessage
                        ? "bg-gray-100 text-gray-800"
                        : "bg-black/30 text-white/90 border border-white/10"
                )}>
                    {children}
                </pre>
            )
        },

        // Blockquotes
        blockquote: ({ children }: BlockquoteProps) => (
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
        ul: ({ children }: UlProps) => (
            <ul className={cn(
                "list-disc list-inside my-2 space-y-1",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                {children}
            </ul>
        ),

        // Ordered lists
        ol: ({ children }: OlProps) => (
            <ol className={cn(
                "list-decimal list-inside my-2 space-y-1",
                isUserMessage ? "text-gray-900" : "text-white"
            )}>
                {children}
            </ol>
        ),

        // List items
        li: ({ children }: LiProps) => (
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
        table: ({ children }: TableProps) => (
            <div className="my-3 overflow-x-auto rounded-lg">
                <table className={cn(
                    "min-w-full text-sm",
                    isUserMessage ? "text-gray-900" : "text-white"
                )}>
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }: TheadProps) => (
            <thead className={cn(
                isUserMessage ? "bg-gray-100" : "bg-white/10"
            )}>
                {children}
            </thead>
        ),
        tbody: ({ children }: TbodyProps) => (
            <tbody className="divide-y divide-white/10">{children}</tbody>
        ),
        tr: ({ children }: TrProps) => (
            <tr className={cn(
                isUserMessage ? "border-b border-gray-200" : "border-b border-white/10"
            )}>
                {children}
            </tr>
        ),
        th: ({ children }: ThProps) => (
            <th className="px-3 py-2 text-left font-semibold">{children}</th>
        ),
        td: ({ children }: TdProps) => (
            <td className="px-3 py-2">{children}</td>
        ),

        // Images 
        img: ({ src, alt }: ImgProps) => {
            const resolvedSrc = typeof src === "string" ? src : ""
            const resolvedAlt = typeof alt === "string" ? alt : ""

            return (
                <LazyImage
                    src={resolvedSrc}
                    alt={resolvedAlt}
                    width={0}
                    height={0}
                    sizes="100vw"
                    wrapperClassName="w-full"
                    style={{ width: '100%', height: 'auto' }}
                    className="rounded-lg my-3"
                    loading="lazy"
                    unoptimized
                />
            )
        },
    }), [isUserMessage, isAgent, isStreaming])

    return (
        <div
            className={cn(
                "markdown-content",
                "[overflow-wrap:break-word]",
                className
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}
