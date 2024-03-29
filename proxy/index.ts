import nubis from "../nubis.json";

console.log("Starting server...");
console.log(`Listening on port ${process.env.PORT ?? 3000}`);
Bun.serve({
    port: Number(process.env.PORT ?? 3000),
    async fetch(req) {
        // Check if the incoming request is a POST request
        if (req.method !== "POST") {
            return new Response("Method not allowed!", { status: 405 });
        }

        // check the bearer token
        const authorization = req.headers.get("Authorization");
        if (!authorization) {
            return new Response("Unauthorized", { status: 401 });
        }
        const accessToken = authorization.split(" ")[1];
        if (accessToken !== nubis.gateway.proxy.accessToken) {
            return new Response("Unauthorized", { status: 401 });
        }

        // Extract the body from the incoming request
        const requestBody = await req.text();

        try {
            // Forward the request to the external URL
            const response = await fetch("https://steamcommunity.com/openid/login", {
                method: "POST",
                body: requestBody,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "*/*"
                },
            });
            if (response.ok) {
                const body = await response.text();

                if (body.includes("is_valid:true")) {
                    return new Response(null, {
                        status: 204
                    });
                }
            }

            return new Response(null, {
                status: 403
            });
        } catch (error) {
            return new Response("Internal Server Error", { status: 500 });
        }
    },
});