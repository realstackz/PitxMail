import { NextRequest, NextResponse } from "next/server";
import { emailEngine } from "@/lib/email/engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await emailEngine.retryEmail(id);

    return NextResponse.json({
      message_id: id,
      success: result.success,
      status: result.status,
      error: result.error,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to retry message" },
      { status: 500 }
    );
  }
}
