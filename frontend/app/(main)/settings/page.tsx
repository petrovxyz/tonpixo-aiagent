"use client"

import { motion } from "framer-motion"

export default function SettingsPage() {
    return (
        <div className="flex flex-col items-center justify-center pt-20 px-6">
            <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold text-white mb-4"
            >
                In development
            </motion.h1>
            <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-white/70 text-lg"
            >
                Settings are not available yet
            </motion.p>
        </div>
    )
}
