import { NextResponse } from "next/server";

export const runtime = "nodejs";

const RETIRED_RESPONSE_BODY = {
  error: {
    code: "OWNER_SESSION_TOKEN_RETIRED",
    message:
      "Phiên đăng nhập của chủ sở hữu không phát hành khóa tích hợp. Hãy tạo Khóa kết nối dịch vụ riêng tại /settings/automation.",
  },
} as const;

const RETIRED_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

function retiredResponse() {
  return NextResponse.json(RETIRED_RESPONSE_BODY, {
    status: 410,
    headers: RETIRED_HEADERS,
  });
}

export async function GET() {
  return retiredResponse();
}

export async function POST() {
  return retiredResponse();
}
