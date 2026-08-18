// Day-0 spike, run against the real API.

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { HydraDBClient } from "@hydradb/sdk";

const DB = process.env.PRION_HYDRA_DB ?? "prion_probe";

const client = new HydraDBClient({
  token: process.env.HYDRA_DB_API_KEY!,
});

function show(label: string, value: unknown) {
  console.log(`\n── ${label} ──`);
  console.log(JSON.stringify(value, null, 2)?.slice(0, 1800));
}

async function main() {
  if (!process.env.HYDRA_DB_API_KEY) {
    console.error("HYDRA_DB_API_KEY is not set.");
    process.exit(1);
  }

  // 1. Auth + database

  try {
    const dbs = await client.databases.list();
    show("databases.list()", dbs);
  } catch (err) {
    console.error("databases.list failed:", err);
  }

  try {
    const created = await client.databases.create({ database: DB });
    show("databases.create()", created);
  } catch (err) {
    console.log(`\n── databases.create() — ${String(err).slice(0, 300)}`);
  }

  // Wait for the database to be ready before ingesting.
  for (let i = 0; i < 24; i++) {
    try {
      const st = await client.databases.status({ database: DB });
      const infra = (
        st as { data?: { infra?: Record<string, unknown> } }
      )?.data?.infra;
      if (i === 0) show("databases.status()", st);
      if (infra?.readyForIngestion || infra?.ready_for_ingestion) {
        console.log("  ready for ingestion");
        break;
      }
    } catch (err) {
      console.log("  status err:", String(err).slice(0, 200));
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 2. graphPayload shape

  // Three papers in a citation chain. Ingested as knowledge items with stable
  // ids, then wired together with graph_payload keyed by those same ids.
  const PAPERS = [
    {
      id: "W_PROBE_TARGET",
      title: "A citing systematic review",
      text: "A systematic review pooling perioperative outcomes. We pooled the effect estimates reported by the meta-analysis of Smith et al.",
      cites: ["W_PROBE_MIDDLE"],
      quote: "we pooled the effect estimates reported by the meta-analysis",
    },
    {
      id: "W_PROBE_MIDDLE",
      title: "A pooled meta-analysis",
      text: "Meta-analysis of perioperative beta-blockade. Primary outcome data were drawn from the trial registry described by Jones et al.",
      cites: ["W_PROBE_RETRACTED"],
      quote: "primary outcome data were drawn from the trial registry",
    },
    {
      id: "W_PROBE_RETRACTED",
      title: "A fabricated trial (RETRACTED)",
      text: "Randomised trial of perioperative beta-blockade. Retracted 2022 for data fabrication.",
      cites: [],
      quote: "",
    },
  ];

  // `relations` declared per item — the documented "forceful relations at
  // ingestion" path, rather than the undocumented graph_payload field.
  const appKnowledge = PAPERS.map((p) => ({
    id: p.id,
    title: p.title,
    content: { text: p.text },
    metadata: {
      node_type: "work",
      openalex_id: p.id,
      is_retracted: p.id === "W_PROBE_RETRACTED",
    },
    ...(p.cites.length > 0 && {
      relations: {
        ids: p.cites,
        properties: {
          predicate: "cites",
          evidence: p.quote,
          edge_class: "load_bearing_data",
          weight: 1.0,
        },
      },
    }),
  }));

  // The shape the 400 describes: source id -> graph payload, using the
  // `relations` block the docs show for forceful relations at ingestion.
  const graphPayload = Object.fromEntries(
    PAPERS.filter((p) => p.cites.length > 0).map((p) => [
      p.id,
      {
        relations: {
          ids: p.cites,
          properties: {
            predicate: "cites",
            evidence: p.quote,
            edge_class: "load_bearing_data",
            weight: 1.0,
          },
        },
      },
    ]),
  );

  try {
    const ingested = await client.context.ingest({
      database: DB,
      type: "knowledge",
      appKnowledge: JSON.stringify(appKnowledge),
    });
    void graphPayload; // shape still unconfirmed — see notes below
    show("context.ingest({ appKnowledge + graphPayload })", ingested);
  } catch (err) {
    console.log(`\n── ingest FAILED — ${String(err).slice(0, 1200)}`);
  }

  // 3. relations: 1-hop or multi-hop?

  await new Promise((r) => setTimeout(r, 8000));

  try {
    const rel = await client.context.relations({ database: DB, limit: 50 });
    show("context.relations() database-wide", rel);
  } catch (err) {
    console.log(`\n── relations FAILED — ${String(err).slice(0, 600)}`);
  }

  try {
    const q = await client.query({
      database: DB,
      query: "fabricated trial pooled effect estimate",
      type: "knowledge",
    });
    show("query()", q);
  } catch (err) {
    console.log(`\n── query FAILED — ${String(err).slice(0, 600)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
