/**
 * POST /api/wallet — Receive passkey credentials AND session key from the frontend,
 * then forward them to the merchant/agent backend.
 *
 * The correct flow:
 *   1. Human creates passkey wallet in the browser (they own it)
 *   2. Human configures budget limits for the agent
 *   3. Browser generates a session key, encrypts the private key with the passkey
 *   4. This route forwards BOTH the passkey credentials and the session key to the backend
 *   5. The agent uses the session key (not the passkey) for autonomous operation
 *
 * GET /api/wallet — Check if the agent already has credentials configured.
 *
 * DELETE /api/wallet — Revoke the current session key (human retains control).
 */

import { NextRequest, NextResponse } from 'next/server';

const MERCHANT_BASE = process.env.MERCHANT_URL || 'http://localhost:4000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, session } = body;

    // Validate wallet (passkey) credentials
    if (!wallet?.credentialId || !wallet?.publicKeyX || !wallet?.publicKeyY || !wallet?.keyHash) {
      return NextResponse.json(
        { error: 'Missing wallet fields: credentialId, publicKeyX, publicKeyY, keyHash' },
        { status: 400 },
      );
    }

    // Validate session key data
    if (!session?.sessionKeyHash || !session?.sessionPublicKey || !session?.encryptedPrivateKey || !session?.sessionAddress) {
      return NextResponse.json(
        { error: 'Missing session key fields: sessionKeyHash, sessionPublicKey, encryptedPrivateKey, sessionAddress' },
        { status: 400 },
      );
    }

    // Forward both wallet credentials and session key to the merchant/agent backend
    const res = await fetch(`${MERCHANT_BASE}/api/v1/agent/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, session }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Agent backend rejected credentials: ${err}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${MERCHANT_BASE}/api/v1/agent/status`);
    if (!res.ok) {
      return NextResponse.json({ configured: false });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ configured: false });
  }
}

export async function DELETE() {
  try {
    const res = await fetch(`${MERCHANT_BASE}/api/v1/agent/credentials`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Failed to revoke session: ${err}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, revoked: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
