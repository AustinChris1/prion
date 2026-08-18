// Provider-agnostic edge classification.

import type { EdgeClass } from "./types";

export type Provider = "heuristic" | "groq" | "anthropic" | "xai" | "openai";

export interface ClassifyInput {
  retractedTitle: string;
  retractedAbstract?: string;
  citingTitle: string;
  // The sentence(s) around the citation marker.
  context: string;
  // Section heading the citation appeared under, if known.
  section?: string;
}

export interface ClassifyOutput {
  edgeClass: EdgeClass;
  confidence: "high" | "medium" | "low";
  evidenceQuote: string;
  provider: Provider;
}

interface ProviderConfig {
  baseUrl: string;
  envKey: string;
  defaultModel: string;
}

const OPENAI_COMPATIBLE: Record<string, ProviderConfig> = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    envKey: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1/chat/completions",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-2-latest",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
  },
};

export function resolveProvider(): Provider {
  const explicit = process.env.PRION_LLM_PROVIDER?.toLowerCase();
  if (explicit && ["heuristic", "groq", "anthropic", "xai", "openai"].includes(explicit)) {
    return explicit as Provider;
  }

  // Fall back to whichever key is actually present, then to no-key heuristic.
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.XAI_API_KEY) return "xai";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "heuristic";
}

const SYSTEM = `You classify how load-bearing a citation is.

Given a retracted paper, a paper citing it, and the sentence around the citation,
return exactly one class:

load_bearing_data    the citing paper reuses the cited paper's data, effect
                     estimate, or measurements (pooled in a meta-analysis,
                     reanalysed, tabulated)
load_bearing_method  the citing paper's method or instrument depends on it
supporting           cited as evidence for a claim, without reusing its data
incidental           background, "see also", passing mention
contrasting          cited in order to dispute, contradict, or fail to
                     replicate it

"contrasting" matters: citing a paper to criticise it is NOT a dependency.
Prefer "incidental" over "supporting" when the sentence is vague.

Quote the exact span from the provided context that justifies your choice.
Never invent a quote.`;

function userPrompt(input: ClassifyInput): string {
  return [
    `RETRACTED PAPER: ${input.retractedTitle}`,
    input.retractedAbstract ? `ABSTRACT: ${input.retractedAbstract.slice(0, 1200)}` : "",
    ``,
    `CITING PAPER: ${input.citingTitle}`,
    input.section ? `SECTION: ${input.section}` : "",
    `CITATION CONTEXT: ${input.context}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const SCHEMA = {
  type: "object",
  properties: {
    edge_class: {
      type: "string",
      enum: [
        "load_bearing_data",
        "load_bearing_method",
        "supporting",
        "incidental",
        "contrasting",
      ],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    evidence_quote: { type: "string" },
  },
  required: ["edge_class", "confidence", "evidence_quote"],
  additionalProperties: false,
} as const;

const CONTRAST_CUES = [
  "contrary to", "in contrast", "failed to replicate", "could not replicate",
  "dispute", "disputed", "refute", "contradict", "however,", "unlike",
  "inconsistent with", "at odds with", "questioned", "criticis", "criticiz",
];

const DATA_CUES = [
  "pooled", "meta-analys", "reanalys", "re-analys", "extracted data",
  "data from", "effect estimate", "we included", "were included in",
];

const METHOD_CUES = [
  "following the method", "as described by", "protocol of", "procedure of",
  "using the approach", "adapted from", "per the method",
];

const SECTION_DEFAULT: Record<string, EdgeClass> = {
  methods: "load_bearing_method",
  method: "load_bearing_method",
  results: "load_bearing_data",
  discussion: "supporting",
  introduction: "incidental",
  background: "incidental",
  related: "incidental",
};

export function classifyHeuristic(input: ClassifyInput): ClassifyOutput {
  const text = `${input.context}`.toLowerCase();
  const hit = (cues: string[]) => cues.find((c) => text.includes(c));

  // Contrast wins outright: a disputed citation is not a dependency.
  // section it sits in.
  const contrast = hit(CONTRAST_CUES);
  if (contrast) {
    return {
      edgeClass: "contrasting",
      confidence: "medium",
      evidenceQuote: excerpt(input.context, contrast),
      provider: "heuristic",
    };
  }

  const data = hit(DATA_CUES);
  if (data) {
    return {
      edgeClass: "load_bearing_data",
      confidence: "medium",
      evidenceQuote: excerpt(input.context, data),
      provider: "heuristic",
    };
  }

  const method = hit(METHOD_CUES);
  if (method) {
    return {
      edgeClass: "load_bearing_method",
      confidence: "medium",
      evidenceQuote: excerpt(input.context, method),
      provider: "heuristic",
    };
  }

  const section = (input.section ?? "").toLowerCase();
  const bySection = Object.entries(SECTION_DEFAULT).find(([k]) =>
    section.includes(k),
  )?.[1];

  return {
    edgeClass: bySection ?? "unknown",
    confidence: "low",
    evidenceQuote: input.context.slice(0, 240),
    provider: "heuristic",
  };
}

function excerpt(text: string, needle: string, pad = 90): string {
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text.slice(0, 240);
  return text.slice(Math.max(0, i - pad), i + needle.length + pad).trim();
}

interface RawResult {
  edge_class: EdgeClass;
  confidence: "high" | "medium" | "low";
  evidence_quote: string;
}

async function callOpenAICompatible(
  provider: keyof typeof OPENAI_COMPATIBLE,
  input: ClassifyInput,
): Promise<RawResult> {
  const cfg = OPENAI_COMPATIBLE[provider];
  const key = process.env[cfg.envKey];
  if (!key) throw new Error(`${cfg.envKey} is not set.`);

  const res = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      // Cloudflare 403s undici's default `User-Agent: node`.
      // `User-Agent: node` with a 403 that reads like a network problem.
      "user-agent": "PRION/0.1 (+https://github.com/prion)",
      accept: "application/json",
    },
    body: JSON.stringify({
      model: process.env.PRION_LLM_MODEL ?? cfg.defaultModel,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "edge_class", schema: SCHEMA, strict: true },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`${provider} returned ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  return JSON.parse(body.choices[0].message.content) as RawResult;
}

async function callAnthropic(input: ClassifyInput): Promise<RawResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "user-agent": "PRION/0.1 (+https://github.com/prion)",
    },
    body: JSON.stringify({
      model: process.env.PRION_LLM_MODEL ?? "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{ role: "user", content: userPrompt(input) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic returned ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  const text = body.content.find(
    (b: { type: string }) => b.type === "text",
  )?.text;

  return JSON.parse(text) as RawResult;
}

export async function classifyEdge(
  input: ClassifyInput,
  provider: Provider = resolveProvider(),
): Promise<ClassifyOutput> {
  if (provider === "heuristic") return classifyHeuristic(input);

  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropic(input)
        : await callOpenAICompatible(provider, input);

    return {
      edgeClass: raw.edge_class,
      confidence: raw.confidence,
      evidenceQuote: raw.evidence_quote,
      provider,
    };
  } catch (err) {
    // A provider outage must not poison the graph with guesses.
    // the heuristic and let the caller see which path produced the label.
    console.warn(`  ${provider} failed, using heuristic: ${String(err)}`);
    return classifyHeuristic(input);
  }
}
