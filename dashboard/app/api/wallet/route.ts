import { NextResponse } from "next/server";

const MERCHANT_URL = process.env.NEXT_PUBLIC_MERCHANT_URL || "http://localhost:4000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Forward to Merchant Server
    const res = await fetch(`${MERCHANT_URL}/api/v1/agent/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to connect to merchant server" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${MERCHANT_URL}/api/v1/agent/status`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    // If merchant is down or no session, return not configured
    return NextResponse.json({ configured: false });
  }
}

export async function DELETE() {
  try {
    const res = await fetch(`${MERCHANT_URL}/api/v1/agent/credentials`, {
      method: "DELETE",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 });
  }
}
