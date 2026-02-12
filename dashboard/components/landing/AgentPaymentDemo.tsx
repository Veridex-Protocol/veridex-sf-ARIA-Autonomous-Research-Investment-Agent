"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Check, Loader2, Wallet, DollarSign, Bot, User } from "lucide-react";

type Message = {
    id: string;
    role: "user" | "agent" | "system";
    content: string;
    type?: "text" | "payment" | "confirmation";
};

const DEMO_SEQUENCE = [
    { role: "user", content: "Find me a GPU cluster for training.", delay: 1000 },
    { role: "agent", content: "Searching decentralized compute markets...", delay: 2000 },
    { role: "agent", content: "Found: H100 Node x8. Rate: $4.50/hr.", delay: 3500 },
    { role: "user", content: "Deploy for 2 hours.", delay: 4500 },
    { role: "system", type: "payment", content: "HTTP 402: Payment Required", delay: 5500 },
    { role: "agent", content: "Verifying funds... wallet connected.", delay: 6500 }, // Wallet action
    { role: "system", type: "confirmation", content: "Transaction 0x8f... Confirmed", delay: 8000 },
    { role: "agent", content: "Deployment active. Access keys sent.", delay: 9000 },
];

export function AgentPaymentDemo() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (step >= DEMO_SEQUENCE.length) {
            const timeout = setTimeout(() => {
                setMessages([]);
                setStep(0);
            }, 5000); // Reset after 5s
            return () => clearTimeout(timeout);
        }

        const current = DEMO_SEQUENCE[step];
        const timeout = setTimeout(() => {
            setMessages((prev) => [
                ...prev,
                {
                    id: Math.random().toString(),
                    role: current.role as "user" | "agent" | "system",
                    content: current.content,
                    type: current.type as any,
                },
            ]);
            setStep((s) => s + 1);
        }, current.delay - (step > 0 ? DEMO_SEQUENCE[step - 1].delay : 0));

        return () => clearTimeout(timeout);
    }, [step]);

    return (
        <div className="w-full max-w-md mx-auto h-[500px] glass rounded-2xl overflow-hidden flex flex-col relative border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-mono text-muted-foreground">AGENT_ID: 8842</span>
                </div>
                <div className="text-xs font-mono text-[#00f0ff]">MONAD_MAINNET</div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {msg.type === "payment" ? (
                                <div className="w-full bg-[#1a1a2e] border border-[#ff2e63]/30 rounded-lg p-3 flex items-center gap-3 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-[#ff2e63]/5 animate-pulse" />
                                    <div className="w-8 h-8 rounded-full bg-[#ff2e63]/20 flex items-center justify-center text-[#ff2e63]">
                                        <DollarSign className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-[#ff2e63] font-bold">PAYMENT REQUIRED</div>
                                        <div className="text-[10px] text-muted-foreground font-mono">Status: 402 - Awaiting Signature</div>
                                    </div>
                                </div>
                            ) : msg.type === "confirmation" ? (
                                <div className="w-full bg-[#00f0ff]/5 border border-[#00f0ff]/30 rounded-lg p-3 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[#00f0ff]/20 flex items-center justify-center text-[#00f0ff]">
                                        <Check className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-[#00f0ff] font-bold">PAYMENT SUCCESS</div>
                                        <div className="text-[10px] text-muted-foreground font-mono">0.05 ETH → 0x71...8a</div>
                                    </div>
                                </div>
                            ) : (
                                <div className={`p-3 rounded-xl text-sm max-w-[80%] ${msg.role === "user"
                                        ? "bg-[#00f0ff] text-black rounded-tr-none font-medium"
                                        : "bg-white/10 text-white rounded-tl-none border border-white/5"
                                    }`}>
                                    {msg.content}
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Typing Indicator */}
                {step < DEMO_SEQUENCE.length && step % 2 !== 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className="bg-white/5 p-2 rounded-lg flex gap-1">
                            <span className="w-1 h-1 bg-white/50 rounded-full animate-bounce" />
                            <span className="w-1 h-1 bg-white/50 rounded-full animate-bounce [animation-delay:0.1s]" />
                            <span className="w-1 h-1 bg-white/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Input Overlay */}
            <div className="p-3 border-t border-white/10 bg-black/60">
                <div className="w-full h-10 bg-white/5 rounded-full border border-white/10 flex items-center px-4">
                    <span className="w-2 h-4 bg-[#00f0ff] animate-pulse block" />
                </div>
            </div>
        </div>
    );
}
