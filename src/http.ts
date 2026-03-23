export interface HttpClientOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, {
      method: "GET",
      headers
    });
  }

  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(this.options.defaultHeaders ?? {}),
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${path}: ${text}`);
    }

    return (await response.json()) as T;
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
