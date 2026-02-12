import { AnimatedHero } from "@/components/landing/AnimatedHero";
import { AgentPaymentDemo } from "@/components/landing/AgentPaymentDemo";
import { BentoGridFeatures } from "@/components/landing/BentoGridFeatures";
import Link from "next/link";
import { ArrowRight, Github, Twitter } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030305] text-white selection:bg-[#00f0ff]/20">

      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#bf00ff] flex items-center justify-center font-bold text-black">
              X
            </div>
            <span className="font-bold text-lg tracking-tight">x402 Protocol</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#developers" className="hover:text-white transition-colors">Developers</Link>
            <Link href="#about" className="hover:text-white transition-colors">About</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="https://github.com/veridex/x402" target="_blank" className="text-muted-foreground hover:text-white transition-colors">
              <Github className="w-5 h-5" />
            </Link>
            <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-full transition-colors hidden sm:block">
              Launch App
            </button>
          </div>
        </div>
      </header>

      <main className="pt-16">

        {/* Hero Section */}
        <AnimatedHero />

        {/* Demo Section */}
        <section className="py-24 relative">
          <div className="container mx-auto px-6">
            <div className="flex flex-col lg:flex-row items-center gap-16">

              {/* Text Content */}
              <div className="flex-1 space-y-8">
                <div className="inline-block px-3 py-1 rounded-full bg-[#bf00ff]/10 border border-[#bf00ff]/20 text-[#bf00ff] text-xs font-mono uppercase tracking-wider">
                  Live on Monad Testnet
                </div>
                <h2 className="text-4xl md:text-5xl font-bold leading-tight">
                  Agents don't use credit cards. <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#bf00ff] to-[#ff2e63]">
                    They stream value.
                  </span>
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  The x402 protocol enables autonomous agents to negotiate, settle, and verify transactions without human intervention.
                  Built for high-frequency, low-latency machine commerce.
                </p>

                <ul className="space-y-4">
                  {[
                    "Instant finality via Monad execution",
                    "Programmatic 402 Payment Required handling",
                    "Verifiable on-chain reputation history"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-muted-foreground">
                      <div className="w-6 h-6 rounded-full bg-[#00f0ff]/10 flex items-center justify-center">
                        <ArrowRight className="w-3 h-3 text-[#00f0ff]" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Interactive Demo */}
              <div className="flex-1 w-full max-w-lg relative group">
                {/* Glow Effect behind demo */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[#00f0ff] to-[#bf00ff] opacity-20 blur-2xl group-hover:opacity-30 transition-opacity duration-500" />
                <AgentPaymentDemo />
              </div>

            </div>
          </div>
        </section>

        {/* Features Grid */}
        <BentoGridFeatures />

        {/* Closing CTA */}
        <section className="py-32 relative text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#00f0ff]/10 to-transparent pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10">
            <h2 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight">
              Ready to <span className="text-[#00f0ff]">Automate?</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
              Join the network of autonomous economic agents.
            </p>
            <div className="flex justify-center gap-6">
              <button className="px-8 py-4 bg-[#00f0ff] text-black font-bold rounded-full hover:shadow-[0_0_40px_rgba(0,240,255,0.4)] transition-shadow">
                Start Building
              </button>
              <button className="px-8 py-4 glass text-white font-medium rounded-full hover:bg-white/10 transition-colors">
                Read Documentation
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 bg-black/40">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground">
          <div>
            © 2026 Veridex Protocol. All rights reserved.
          </div>
          <div className="flex gap-6 mt-4 md:mt-0">
            <Link href="#" className="hover:text-[#00f0ff]">Twitter</Link>
            <Link href="#" className="hover:text-[#00f0ff]">Discord</Link>
            <Link href="#" className="hover:text-[#00f0ff]">GitHub</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
