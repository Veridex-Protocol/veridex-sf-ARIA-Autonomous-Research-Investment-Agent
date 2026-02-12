"use client";

import { motion } from "framer-motion";
import { Shield, Zap, Globe, Key, Activity, Star, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
    {
        title: "BITE Encryption",
        description: "Conditional transactions that decrypt only when terms are met.",
        icon: Lock,
        className: "md:col-span-2",
    },
    {
        title: "Zero Gas & Instant",
        description: "High-frequency agent execution on SKALE.",
        icon: Zap,
        className: "md:col-span-1",
    },
    {
        title: "AP2 Mandates",
        description: "Clean intent → authorization → settlement flows.",
        icon: Globe,
        className: "md:col-span-1",
    },
    {
        title: "x402 Streaming",
        description: "Native HTTP 402 payment required handling.",
        icon: Key,
        className: "md:col-span-2",
    },
];

export function BentoGridFeatures() {
    return (
        <section className="py-24 relative overflow-hidden">
            <div className="container mx-auto px-6 relative z-10">
                <div className="mb-16 max-w-2xl">
                    <h2 className="text-4xl md:text-5xl font-bold mb-6">
                        Everything your agent <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-[#bf00ff]">
                            needs to survive.
                        </span>
                    </h2>
                    <p className="text-lg text-muted-foreground">
                        A complete suite of tools for autonomous commerce on the SKALE Network.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[250px]">
                    {FEATURES.map((feature, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            viewport={{ once: true }}
                            className={`glass rounded-3xl p-8 relative group overflow-hidden ${feature.className} flex flex-col justify-between`}
                        >
                            {/* Hover Effect */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            {/* Icon */}
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-300">
                                <feature.icon className="w-6 h-6 text-[#00f0ff]" />
                            </div>

                            {/* Content */}
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#00f0ff] transition-colors">
                                    {feature.title}
                                </h3>
                                <p className="text-muted-foreground leading-relaxed">
                                    {feature.description}
                                </p>
                            </div>

                            {/* Decoration */}
                            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-[#00f0ff]/10 rounded-full blur-3xl group-hover:bg-[#bf00ff]/20 transition-colors duration-500" />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
