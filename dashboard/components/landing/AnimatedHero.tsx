"use client";

import { motion, useAnimation } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Zap, Globe, Cpu } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- Agent Node Component ---
const AgentNode = ({ cx, cy, delay, scale = 1 }: { cx: number; cy: number; delay: number; scale?: number }) => (
    <motion.g
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay, type: "spring" }}
    >
        {/* Glow */}
        <motion.circle
            cx={cx}
            cy={cy}
            r={20 * scale}
            fill="url(#glow-gradient)"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Core */}
        <circle cx={cx} cy={cy} r={4 * scale} fill="#00f0ff" className="filter drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]" />
        {/* Orbit Ring */}
        <motion.circle
            cx={cx}
            cy={cy}
            r={12 * scale}
            stroke="#00f0ff"
            strokeWidth="0.5"
            fill="none"
            strokeDasharray="4 4"
            animate={{ rotate: 360 }}
            style={{ originX: "50%", originY: "50%" }} // Rotate around center? No, this rotates the element itself around its CSS center
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />
    </motion.g>
);

// --- Connection Line Component ---
const ConnectionLine = ({ x1, y1, x2, y2, active }: { x1: number; y1: number; x2: number; y2: number; active: boolean }) => (
    <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        {active && (
            <motion.circle
                r={2}
                fill="#bf00ff" // Neon Purple for transaction
                initial={{ cx: x1, cy: y1 }}
                animate={{ cx: [x1, x2], cy: [y1, y2] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="filter drop-shadow-[0_0_4px_#bf00ff]"
            />
        )}
    </g>
);

export function AnimatedHero() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="relative h-[90vh] w-full overflow-hidden flex items-center justify-center bg-[#030305]">
            {/* Background Grid */}
            <div className="absolute inset-0 grid-bg opacity-30" />

            {/* SVG Visualization Layer */}
            <div className="absolute inset-0 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 1000 600" className="w-full h-full opacity-60">
                    <defs>
                        <radialGradient id="glow-gradient" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                        </radialGradient>
                    </defs>

                    {/* Connections */}
                    <ConnectionLine x1={200} y1={300} x2={500} y2={150} active={true} />
                    <ConnectionLine x1={200} y1={300} x2={500} y2={450} active={false} />
                    <ConnectionLine x1={800} y1={300} x2={500} y2={150} active={true} />
                    <ConnectionLine x1={800} y1={300} x2={500} y2={450} active={false} />
                    <ConnectionLine x1={500} y1={150} x2={500} y2={450} active={true} />

                    {/* Nodes */}
                    <AgentNode cx={200} cy={300} delay={0} scale={1.2} /> {/* User Agent */}
                    <AgentNode cx={500} cy={150} delay={0.2} /> {/* Service Agent A */}
                    <AgentNode cx={500} cy={450} delay={0.4} /> {/* Service Agent B */}
                    <AgentNode cx={800} cy={300} delay={0.6} scale={1.2} /> {/* Execution Agent */}

                </svg>
            </div>

            {/* Content Layer */}
            <div className="relative z-10 container mx-auto px-6 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-4xl mx-auto space-y-8"
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 glass backdrop-blur-md mb-4 animate-float">
                        <span className="w-2 h-2 rounded-full bg-[#00f0ff] shadow-[0_0_10px_#00f0ff]" />
                        <span className="text-xs font-mono text-[#00f0ff] uppercase tracking-wider">x402 Protocol Live</span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-tight">
                        The Economy of <br />
                        <span className="text-gradient-cyan relative">
                            Invisible Minds
                            <motion.span
                                className="absolute -bottom-2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent opacity-50"
                                animate={{ scaleX: [0.8, 1.2, 0.8], opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 3, repeat: Infinity }}
                            />
                        </span>
                    </h1>

                    {/* Subheadline */}
                    <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        Infrastructure for the autonomous age. Native <span className="text-white font-mono bg-white/10 px-1 rounded">HTTP 402</span> payments, identity validation, and reputation scoring for AI agents on Monad.
                    </p>

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-8 py-4 bg-[#00f0ff] text-black font-bold rounded-full shadow-[0_0_30px_rgba(0,240,255,0.3)] hover:shadow-[0_0_50px_rgba(0,240,255,0.5)] transition-all flex items-center gap-2 group"
                        >
                            Deploy Agent
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-8 py-4 glass text-white font-medium rounded-full hover:bg-white/10 transition-all flex items-center gap-2 border border-white/10"
                        >
                            <Cpu className="w-4 h-4" />
                            View Protocol
                        </motion.button>
                    </div>
                </motion.div>
            </div>

            {/* Bottom Gradient Overlay */}
            <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#030305] to-transparent pointer-events-none" />
        </div>
    );
}
