"use client";

import { useAgentEvents } from "@/hooks/use-agent-events";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, DollarSign, Command, CheckCircle, AlertCircle, Cpu } from "lucide-react";

export function LiveActivityFeed() {
    const { events, isConnected } = useAgentEvents();

    return (
        <div className="w-full glass rounded-3xl overflow-hidden border border-white/10 h-[400px] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#00f0ff]" />
                    <span className="text-sm font-bold text-white">Live Network Activity</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                    {isConnected ? "CONNECTED" : "DISCONNECTED"}
                </div>
            </div>

            {/* Feed */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2 scrollbar-hide bg-black/20 font-mono text-xs">
                <AnimatePresence initial={false}>
                    {events.length === 0 && isConnected && (
                        <div className="text-center text-muted-foreground py-10 opacity-50">
                            Waiting for agent activity...
                        </div>
                    )}

                    {events.map((event, i) => (
                        <motion.div
                            key={event.timestamp + i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-start gap-3 p-2 rounded hover:bg-white/5 border-l-2 border-transparent hover:border-[#00f0ff]/50 transition-colors"
                        >
                            <div className="mt-0.5">
                                {event.type.includes("payment") ? (
                                    <DollarSign className="w-3 h-3 text-[#ff2e63]" />
                                ) : event.type.includes("mandate") ? (
                                    <CheckCircle className="w-3 h-3 text-green-500" />
                                ) : event.type.includes("agent") ? (
                                    <Cpu className="w-3 h-3 text-[#bf00ff]" />
                                ) : (
                                    <Command className="w-3 h-3 text-muted-foreground" />
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`uppercase font-bold ${event.type.includes("payment") ? "text-[#ff2e63]" :
                                        event.type.includes("mandate") ? "text-green-500" :
                                            "text-[#00f0ff]"
                                        }`}>
                                        {event.type.replace(":", " ")}
                                    </span>
                                    <span className="text-muted-foreground text-[10px]">
                                        {new Date(event.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <div className="text-muted-foreground break-all">
                                    {JSON.stringify(event.data)}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
