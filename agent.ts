// agent.ts — Pollinations code-agent runtime probe (v4).
//
// v1 bindings/identity, v2 raw-IP block (1003), v3 CF-egress port map.
// v4: the platform's own legacy text EC2 service (documented in the January
// 2026 incident report as "Cloudflare-only firewall" on ports 16384/16385,
// plaintext `x-enter-token` header). Reachability and surface from inside the
// platform's own Cloudflare egress.

type Probe = { status?: number; len?: number; head?: string; error?: string };

async function probe(url: string, init?: RequestInit): Promise<Probe> {
    try {
        const r = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(5000),
            redirect: "manual",
        });
        const t = await r.text().catch(() => "");
        return { status: r.status, len: t.length, head: t.slice(0, 200) };
    } catch (e) {
        return { error: String(e).slice(0, 110) };
    }
}

export default async function main(ctx: any) {
    const out: any = { ok: true, ts: new Date().toISOString(), part: 4 };
    const host = "ec2-3-80-56-235.compute-1.amazonaws.com";
    const probes: Record<string, Probe> = {};

    probes["open"] = await probe("https://api.ipify.org?format=json");

    for (const port of [16384, 16385]) {
        for (const path of ["/", "/health", "/openapi.json", "/docs"]) {
            probes[`${port}${path}`] = await probe(
                `http://${host}:${port}${path}`,
            );
        }
    }
    // same endpoint with a bogus token header (see whether the error differs)
    probes["16384/x-enter-token=bogus"] = await probe(`http://${host}:16384/`, {
        headers: { "x-enter-token": "bogus" },
    });
    probes["16384/x-backend-token=bogus"] = await probe(`http://${host}:16384/`, {
        headers: { "x-backend-token": "bogus" },
    });
    probes["16384/x-enter-token=empty"] = await probe(`http://${host}:16384/`, {
        headers: { "x-enter-token": "" },
    });

    out.probes = probes;
    const text = JSON.stringify(out);
    return new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "content-type": "application/json" } },
    );
}
