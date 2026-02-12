'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Fingerprint, KeyRound, ArrowRight, CheckCircle2,
  XCircle, Loader2, Shield, Cpu, Lock, Zap,
  DollarSign, Clock, Ban, Settings2, Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { WalletCredentials, SessionKeyData, WalletSetupResult } from '@/lib/passkey';

// Step 1: passkey  →  Step 2: budget config  →  Step 3: session key  →  Step 4: send  →  done
type Step = 'idle' | 'passkey-pending' | 'budget-config' | 'session-creating' | 'sending' | 'done' | 'error';

interface AgentStatus {
  configured: boolean;
  keyHash?: string;
  sessionAddress?: string;
  sessionKeyHash?: string;
  dailyLimitUSD?: number;
  perTransactionLimitUSD?: number;
  expiresAt?: number;
  configuredAt?: string;
}

const FLOW_STEPS = [
  {
    icon: Fingerprint,
    title: 'Create Your Wallet',
    description: 'Register a P-256 passkey via WebAuthn — you own this wallet',
  },
  {
    icon: Settings2,
    title: 'Set Agent Budget',
    description: 'Configure daily limits, per-transaction caps, and session duration',
  },
  {
    icon: Cpu,
    title: 'Generate Session Key',
    description: 'A secp256k1 key is created and encrypted with your passkey',
  },
  {
    icon: Zap,
    title: 'Agent Operates Autonomously',
    description: 'The agent uses the session key within your authorized budget',
  },
];

export default function SetupPage() {
  const [step, setStep] = useState<Step>('idle');
  const [walletCreds, setWalletCreds] = useState<WalletCredentials | null>(null);
  const [sessionData, setSessionData] = useState<SessionKeyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [username, setUsername] = useState('aria-agent');

  // Budget config state
  const [dailyLimit, setDailyLimit] = useState('50');
  const [perTxLimit, setPerTxLimit] = useState('5');
  const [expiryHours, setExpiryHours] = useState('24');

  useEffect(() => {
    fetch('/api/wallet')
      .then((r) => r.json())
      .then(setAgentStatus)
      .catch(() => setAgentStatus({ configured: false }));
  }, []);

  // Step 1: Create passkey wallet
  const createWallet = useCallback(async () => {
    setStep('passkey-pending');
    setError(null);
    try {
      const { createPasskeyWallet } = await import('@/lib/passkey');
      const creds = await createPasskeyWallet(username, username);
      setWalletCreds(creds);
      setStep('budget-config');
    } catch (err: any) {
      setError(err.message || 'Wallet creation failed');
      setStep('error');
    }
  }, [username]);

  // Step 1 (alt): Sign in with existing passkey
  const signIn = useCallback(async () => {
    setStep('passkey-pending');
    setError(null);
    try {
      const { authenticatePasskey } = await import('@/lib/passkey');
      const creds = await authenticatePasskey();
      setWalletCreds(creds);
      setStep('budget-config');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setStep('error');
    }
  }, []);

  // Step 2 → 3 → 4: Generate session key and send to agent
  const authorizeAgent = useCallback(async () => {
    if (!walletCreds) return;
    setStep('session-creating');
    setError(null);
    try {
      const { createSessionKey } = await import('@/lib/passkey');
      const session = await createSessionKey(walletCreds, {
        dailyLimitUSD: parseFloat(dailyLimit) || 50,
        perTransactionLimitUSD: parseFloat(perTxLimit) || 5,
        expiryHours: parseFloat(expiryHours) || 24,
        allowedChains: [30], // Base (Wormhole chain ID)
      });
      setSessionData(session);

      setStep('sending');
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletCreds, session }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to configure agent');
      }
      setAgentStatus({
        configured: true,
        keyHash: walletCreds.keyHash,
        sessionAddress: session.sessionAddress,
        sessionKeyHash: session.sessionKeyHash,
        dailyLimitUSD: session.config.dailyLimitUSD,
        perTransactionLimitUSD: session.config.perTransactionLimitUSD,
        expiresAt: session.expiresAt,
      });
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Session key creation failed');
      setStep('error');
    }
  }, [walletCreds, dailyLimit, perTxLimit, expiryHours]);

  // Revoke session
  const revokeSession = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet', { method: 'DELETE' });
      if (res.ok) {
        setAgentStatus({ configured: false });
        setWalletCreds(null);
        setSessionData(null);
        setStep('idle');
      }
    } catch { /* ignore */ }
  }, []);

  const activeStep = step === 'idle' ? 0
    : step === 'passkey-pending' ? 0
    : step === 'budget-config' ? 1
    : step === 'session-creating' ? 2
    : step === 'sending' ? 3
    : step === 'done' ? 4
    : 0;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg space-y-5 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 glow-primary">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet Setup</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Create your wallet, set a budget, and authorize the agent
          </p>
        </div>

        {/* Already configured — show status + revoke */}
        {agentStatus?.configured && step === 'idle' && (
          <Card className="border-emerald-500/30 glow-success">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-400">Session Active</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The agent is authorized to operate within your budget.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Session Address" value={agentStatus.sessionAddress || '—'} mono />
                <InfoField label="Daily Limit" value={`$${agentStatus.dailyLimitUSD || '—'}`} />
                <InfoField label="Per-Tx Limit" value={`$${agentStatus.perTransactionLimitUSD || '—'}`} />
                <InfoField label="Expires" value={agentStatus.expiresAt ? new Date(agentStatus.expiresAt).toLocaleString() : '—'} />
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button asChild className="flex-1 gap-2">
                  <Link href="/">
                    Open Dashboard <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="destructive" size="default" className="gap-2" onClick={revokeSession}>
                  <Ban className="h-4 w-4" />
                  Revoke
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flow steps indicator */}
        {step !== 'done' && !agentStatus?.configured && (
          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
              <CardDescription>You stay in control — the agent only gets a session key</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {FLOW_STEPS.map((s, i) => {
                  const isActive = i === activeStep;
                  const isDone = i < activeStep;
                  return (
                    <div key={i} className={cn(
                      'flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors',
                      isActive && 'bg-primary/5',
                      isDone && 'opacity-60',
                    )}>
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive ? 'bg-primary/15' : isDone ? 'bg-emerald-500/15' : 'bg-muted',
                      )}>
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <s.icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        )}
                      </div>
                      <div className="pt-0.5">
                        <p className={cn('text-xs font-medium', isActive && 'text-primary')}>{s.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Create / Sign In */}
        {step === 'idle' && !agentStatus?.configured && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-primary" />
                Step 1: Create Your Wallet
              </CardTitle>
              <CardDescription>This passkey wallet belongs to you — not the agent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Wallet Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                  placeholder="aria-agent"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={createWallet} className="flex-1 gap-2">
                  <Fingerprint className="h-4 w-4" />
                  Create Passkey
                </Button>
                <Button onClick={signIn} variant="outline" className="flex-1 gap-2">
                  <KeyRound className="h-4 w-4" />
                  Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Passkey pending */}
        {step === 'passkey-pending' && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 animate-pulse-glow">
                <Fingerprint className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-semibold">Waiting for passkey...</p>
              <p className="text-xs text-muted-foreground">
                Follow your browser&apos;s prompt to create or select a passkey
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Budget Configuration */}
        {step === 'budget-config' && walletCreds && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                Step 2: Set Agent Budget
              </CardTitle>
              <CardDescription>
                Define how much the agent can spend. You can revoke at any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Wallet confirmation */}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">Wallet Created</span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground break-all">
                  {walletCreds.keyHash}
                </p>
              </div>

              <Separator />

              {/* Budget fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5">
                    <DollarSign className="h-3 w-3" /> Daily Limit (USD)
                  </label>
                  <input
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                    min="1"
                    step="1"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5">
                    <DollarSign className="h-3 w-3" /> Per-Tx Limit (USD)
                  </label>
                  <input
                    type="number"
                    value={perTxLimit}
                    onChange={(e) => setPerTxLimit(e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                    min="0.01"
                    step="0.01"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5">
                  <Clock className="h-3 w-3" /> Session Duration (hours)
                </label>
                <input
                  type="number"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                  min="1"
                  max="24"
                  step="1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Max 24 hours. The session key expires after this.</p>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Authorization Summary</p>
                <p className="text-xs text-foreground">
                  The agent can spend up to <strong>${dailyLimit}/day</strong>, max <strong>${perTxLimit}/transaction</strong>, for <strong>{expiryHours} hours</strong>.
                </p>
              </div>

              <Button onClick={authorizeAgent} className="w-full gap-2">
                <Shield className="h-4 w-4" />
                Authorize Agent
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Session key creating */}
        {step === 'session-creating' && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 animate-pulse-glow">
                <Cpu className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-semibold">Generating session key...</p>
              <p className="text-xs text-muted-foreground">
                Creating a budget-constrained key encrypted with your passkey
              </p>
            </CardContent>
          </Card>
        )}

        {/* Sending state */}
        {step === 'sending' && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              </div>
              <p className="text-sm font-semibold">Configuring agent...</p>
              <p className="text-xs text-muted-foreground">
                Sending the session key to the agent backend
              </p>
            </CardContent>
          </Card>
        )}

        {/* Success state */}
        {step === 'done' && walletCreds && sessionData && (
          <div className="space-y-4">
            <Card className="border-emerald-500/30 glow-success">
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-400">Agent Authorized</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The agent has a session key with your authorized budget. You can revoke it at any time.
                  </p>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button asChild className="gap-2">
                    <Link href="/">
                      Open Dashboard <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-3.5 w-3.5" /> Your Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CredField label="Passkey Hash" value={walletCreds.keyHash} />
                <CredField label="Credential ID" value={walletCreds.credentialId} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5" /> Agent Session Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CredField label="Session Address" value={sessionData.sessionAddress} />
                <CredField label="Session Key Hash" value={sessionData.sessionKeyHash} />
                <div className="grid grid-cols-3 gap-2">
                  <InfoField label="Daily Limit" value={`$${sessionData.config.dailyLimitUSD}`} />
                  <InfoField label="Per-Tx Limit" value={`$${sessionData.config.perTransactionLimitUSD}`} />
                  <InfoField label="Expires" value={`${sessionData.config.expiryHours}h`} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error state */}
        {step === 'error' && (
          <Card className="border-red-500/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                  <XCircle className="h-5 w-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-400">Error</p>
                  <p className="text-xs text-muted-foreground mt-1">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => { setStep('idle'); setError(null); setWalletCreds(null); }}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CredField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-[11px] text-foreground/80 break-all">
        {value}
      </div>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      <p className={cn('text-xs text-foreground', mono && 'font-mono text-[11px] break-all')}>
        {value}
      </p>
    </div>
  );
}
