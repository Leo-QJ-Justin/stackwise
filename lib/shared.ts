export const CATEGORIES = [
  "Development",
  "Skills & File Handling",
  "Integrations",
  "Workflow & Agents",
  "Prompting & Context",
  "Research & Knowledge",
  "UI & Frontend",
  "My Skills",
] as const;

export interface ProviderConfig {
  id: string;
  label: string;
  needsKey: boolean;
  defaultModel: string;
  group: "local" | "cloud" | "meta";
  hint: string;
}

export const PROVIDERS: ProviderConfig[] = [
  { id: "claude-cli", label: "Claude Code CLI", needsKey: false, defaultModel: "", group: "local", hint: "Uses your authenticated Claude Code installation. No API key needed." },
  { id: "ollama", label: "Ollama (local)", needsKey: false, defaultModel: "llama3.1", group: "local", hint: "Runs locally via Ollama. No API key needed." },
  { id: "anthropic", label: "Anthropic", needsKey: true, defaultModel: "claude-sonnet-4-20250514", group: "cloud", hint: "Direct Anthropic API access." },
  { id: "openai", label: "OpenAI", needsKey: true, defaultModel: "gpt-4o", group: "cloud", hint: "GPT-4o and other OpenAI models." },
  { id: "google", label: "Google Gemini", needsKey: true, defaultModel: "gemini-2.5-flash", group: "cloud", hint: "Gemini models via Google AI Studio key." },
  { id: "mistral", label: "Mistral", needsKey: true, defaultModel: "mistral-large-latest", group: "cloud", hint: "Mistral AI models." },
  { id: "bedrock", label: "Amazon Bedrock", needsKey: true, defaultModel: "anthropic.claude-sonnet-4-20250514-v1:0", group: "cloud", hint: "Format: ACCESS_KEY:SECRET_KEY:REGION" },
  { id: "openrouter", label: "OpenRouter", needsKey: true, defaultModel: "anthropic/claude-sonnet-4-5", group: "meta", hint: "Access 200+ models with one API key." },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function parseProvides(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
