export type SignUpPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8001";

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function parseDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          typeof item === "object" &&
          item !== null &&
          "msg" in item &&
          typeof item.msg === "string"
        ) {
          return item.msg;
        }

        return "";
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return fallback;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const bodyText = await response.text();

  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return null;
  }
}

export async function signUp(payload: SignUpPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const parsedBody = await parseJsonResponse(response);

  if (!response.ok) {
    const fallback = `Signup failed with status ${response.status}`;
    const errorDetail =
      typeof parsedBody === "object" && parsedBody !== null && "detail" in parsedBody
        ? parseDetail(parsedBody.detail, fallback)
        : fallback;

    throw new ApiRequestError(errorDetail, response.status);
  }

  return parsedBody as AuthResponse;
}
