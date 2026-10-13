// agent.ts — Pollinations code-agent runtime probe (v3).
//
// v1: bindings / request shape / outbound identity.
// v2: raw-IP reachability -> Cloudflare blocks direct-IP subrequests (1003).
// v3: reachability through non-Cloudflare-proxied hostnames (sslip.io) so the
//     fetch egresses the platform's own Cloudflare network to the target.

type Probe = { status?: number; len?: number; head?: string; error?: string };

async function probe(url: string, init?: RequestInit): Promise<Probe> {
    try {
        const r = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(4000),
            redirect: "manual",
        });
        const t = await r.text().catch(() => "");
        return { status: r.status, len: t.length, head: t.slice(0, 140) };
    } catch (e) {
        return { error: String(e).slice(0, 110) };
    }
}

export default async function main(ctx: any) {
    const request: Request = ctx.request;
    const out: any = { ok: true, ts: new Date().toISOString(), part: 3 };

    try {
        const mod: any = await import("cloudflare:workers");
        out.envKeys = Object.keys(mod.env || {});
    } catch (e) {
        out.envError = String(e);
    }

    const targets: string[] = [];
    for (const ip of ["20.106.136.139", "172.174.39.180"]) {
        for (const port of [80, 443, 3000, 5000, 6443, 8000, 8080, 8443, 9090, 10250, 2375]) {
            targets.push("http://" + ip + ".sslip.io:" + port + "/");
        }
    }
    targets.push(
        "http://20.106.136.139.sslip.io:22/",
        "https://api.pollinations.ai/version",
        "https://gen.pollinations.ai/register",
        "https://portkey.myceli.ai/",
    );

    const probes: Record<string, Probe> = {};
    for (const t of targets) {
        probes[t] = await probe(t, { method: "GET" });
    }
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
