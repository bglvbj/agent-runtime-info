// agent.ts — minimal runtime-info agent for the Pollinations code-agent
// runtime. Returns a self-describing report so a developer can see how the
// sandboxed Worker behaves (bindings, request shape, outbound identity).
//
// Exported shape expected by the runtime: default async function that accepts
// the agent context ({ request, pollinations, mcp, ... }) and returns a
// Response (OpenAI Responses-compatible JSON).

export default async function main(ctx: any) {
    const request: Request = ctx.request;
    const out: any = {
        ok: true,
        ts: new Date().toISOString(),
        reqUrl: request.url,
        reqMethod: request.method,
        reqHeaders: Object.fromEntries(request.headers as any),
        ctxKeys: Object.keys(ctx || {}),
    };

    // Bindings available to this isolate.
    try {
        const mod: any = await import("cloudflare:workers");
        const env = mod.env;
        out.envKeys = Object.keys(env || {});
        out.envValues = {};
        for (const k of out.envKeys) {
            try {
                out.envValues[k] = String((env as any)[k]).slice(0, 300);
            } catch (e) {
                out.envValues[k] = "ERR";
            }
        }
        out.hasCtx = typeof mod.ctx;
        out.ctxReady = !!(mod.ctx && typeof mod.ctx.waitUntil === "function");
    } catch (e) {
        out.envError = String(e);
    }

    // Outbound identity: what do remote servers see when this agent calls out?
    const probes: any = {};
    const targets = [
        "https://httpbin.org/headers",
        "https://api.ipify.org?format=json",
    ];
    for (const t of targets) {
        try {
            const r = await fetch(t, { headers: { "x-probe": "runtime-info" } });
            probes[t] = { status: r.status, body: (await r.text()).slice(0, 2000) };
        } catch (e) {
            probes[t] = { error: String(e) };
        }
    }
    // Same-origin call: the outbound context is expected to attach an agent
    // run token for the platform origin only.
    try {
        const r = await fetch("https://gen.pollinations.ai/v1/models");
        const t = await r.text();
        probes["gen/v1/models"] = { status: r.status, len: t.length, head: t.slice(0, 160) };
    } catch (e) {
        probes["gen/v1/models"] = { error: String(e) };
    }
    out.probes = probes;

    try {
        out.inboundBody = (await request.text()).slice(0, 400);
    } catch (e) {
        out.inboundBody = "unreadable";
    }

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
                content: [
                    { type: "output_text", text, annotations: [] },
                ],
            },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}
