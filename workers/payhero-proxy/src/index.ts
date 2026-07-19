const PAYHERO_API = "https://backend.payhero.co.ke/api/v2";

interface Env {
	FIREBASE_SERVICE_ACCOUNT?: string;
	PAYHERO_API_TOKEN?: string;
	PAYHERO_CHANNEL_ID?: string;
	ALLOWED_ORIGIN?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function corsHeaders(origin: string | null, allowedOrigin?: string): Record<string, string> {
	const allowed = allowedOrigin || "";
	const useOrigin = (origin && allowed && origin === allowed) ? origin : (allowed || "*");
	return {
		"Access-Control-Allow-Origin": useOrigin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	};
}

function base64url(str: string): string {
	return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getFirebaseToken(sa: any): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	if (cachedToken && cachedToken.expiresAt > now + 60) {
		return cachedToken.token;
	}

	const header = { alg: "RS256", typ: "JWT" };
	const payload = {
		iss: sa.client_email,
		scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.database",
		aud: "https://oauth2.googleapis.com/token",
		exp: now + 3600,
		iat: now,
	};

	const headerB64 = base64url(JSON.stringify(header));
	const payloadB64 = base64url(JSON.stringify(payload));
	const toSign = `${headerB64}.${payloadB64}`;

	const pemBody = sa.private_key
		.replace(/-----BEGIN PRIVATE KEY-----/, "")
		.replace(/-----END PRIVATE KEY-----/, "")
		.replace(/\n/g, "")
		.replace(/\r/g, "");
	const binaryKey = new Uint8Array(atob(pemBody).split("").map(c => c.charCodeAt(0)));

	const privateKey = await crypto.subtle.importKey(
		"pkcs8",
		binaryKey,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"]
	);

	const signature = await crypto.subtle.sign(
		{ name: "RSASSA-PKCS1-v1_5" },
		privateKey,
		new TextEncoder().encode(toSign)
	);

	const sigB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
	const jwtToken = `${toSign}.${sigB64}`;

	const resp = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(jwtToken)}`,
	});

	const data: any = await resp.json();
	if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data));

	cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
	return data.access_token;
}

async function frGet(token: string, projectId: string, path: string): Promise<any> {
	const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
	const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	return resp.json();
}

async function frPatch(token: string, projectId: string, path: string, fields: any): Promise<any> {
	const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
	const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?${mask}`;
	const resp = await fetch(url, {
		method: "PATCH",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ fields }),
	});
	return resp.json();
}

function toStr(v: any): string | undefined {
	return v?.stringValue;
}

function extractPayStatus(data: any): string {
	if (typeof data === "string") return data.toLowerCase();
	if (data?.data?.status) return String(data.data.status).toLowerCase();
	if (data?.status === 200 && data?.data) return extractPayStatus(data.data);
	if (data?.result?.status) return String(data.result.status).toLowerCase();
	if (data?.transaction_status) return String(data.transaction_status).toLowerCase();
	if (data?.data?.transaction_status) return String(data.data.transaction_status).toLowerCase();
	if (typeof data?.status === "string") return data.status.toLowerCase();
	return "";
}

async function updateFirestoreFromPayment(env: Env, ref: string, isSuccess: boolean, altRef?: string | null): Promise<void> {
	const sa = env.FIREBASE_SERVICE_ACCOUNT;
	if (!sa) return;

	try {
		const parsed = JSON.parse(sa);
		const token = await getFirebaseToken(parsed);
		const projectId = parsed.project_id;

		let payDoc = await frGet(token, projectId, `payments/${encodeURIComponent(ref)}`);
		let usedRef = ref;
		if (!payDoc.fields && altRef && altRef !== ref) {
			payDoc = await frGet(token, projectId, `payments/${encodeURIComponent(altRef)}`);
			usedRef = altRef;
		}

		const pf = payDoc.fields || {};
		const type = toStr(pf.type) || "paper";

		if (isSuccess) {
			if (type === "vip") {
				await frPatch(token, projectId, `payments/${encodeURIComponent(usedRef)}`, {
					status: { stringValue: "completed" },
				});
				const userId = toStr(pf.uid);
				if (userId) {
					await frPatch(token, projectId, `users/${encodeURIComponent(userId)}`, {
						vip: { booleanValue: true },
						vipExpiry: { timestampValue: new Date("2026-08-31").toISOString() },
					});
				}
			} else if (type === "paper") {
				await frPatch(token, projectId, `payments/${encodeURIComponent(usedRef)}`, {
					status: { stringValue: "completed" },
				});
			}
		} else {
			await frPatch(token, projectId, `payments/${encodeURIComponent(usedRef)}`, {
				status: { stringValue: "failed" },
			});
		}
	} catch (e) {
		console.error("Firestore update error:", e);
	}
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
	}

	const ref = body.reference || body.external_reference;
	if (!ref) {
		return new Response(JSON.stringify({ error: "no reference" }), { status: 400 });
	}

	const payStatus = extractPayStatus(body);
	const isSuccess = payStatus === "completed" || payStatus === "success";

	await updateFirestoreFromPayment(env, ref, isSuccess, body.external_reference || null);

	return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function verifyPayment(request: Request, env: Env, origin: string | null): Promise<Response> {
	const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

	let body: any;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers });
	}

	const ref = body.reference;
	if (!ref || typeof ref !== "string" || ref.length > 100) {
		return new Response(JSON.stringify({ error: "valid reference required" }), { status: 400, headers });
	}

	try {
		const sa = env.FIREBASE_SERVICE_ACCOUNT;
		if (sa) {
			try {
				const parsed = JSON.parse(sa);
				const token = await getFirebaseToken(parsed);
				const payDoc = await frGet(token, parsed.project_id, `payments/${encodeURIComponent(ref)}`);
				if (payDoc.fields?.status?.stringValue === "completed") {
					return new Response(JSON.stringify({ status: "success", source: "firestore", reference: ref }), {
						status: 200, headers: { "Content-Type": "application/json", ...headers },
					});
				}
				if (payDoc.fields?.status?.stringValue === "failed") {
					return new Response(JSON.stringify({ status: "failed", source: "firestore", reference: ref }), {
						status: 200, headers: { "Content-Type": "application/json", ...headers },
					});
				}
			} catch { /* fall through to PayHero check */ }
		}

		const apiToken = env.PAYHERO_API_TOKEN;
		if (!apiToken) {
			return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
				status: 500, headers: { "Content-Type": "application/json", ...headers },
			});
		}

		const response = await fetch(`${PAYHERO_API}/transaction-status?reference=${encodeURIComponent(ref)}`, {
			headers: { Authorization: `Basic ${apiToken}` },
		});
		const payheroData = await response.json();

		const payStatus = extractPayStatus(payheroData);
		const isSuccess = payStatus === "completed" || payStatus === "success";

		if (isSuccess) {
			await updateFirestoreFromPayment(env, ref, true);
		}

		return new Response(JSON.stringify({
			status: isSuccess ? "success" : payStatus || "unknown",
			reference: ref,
		}), { status: 200, headers: { "Content-Type": "application/json", ...headers } });
	} catch (error) {
		return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Verification failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json", ...headers },
		});
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get("Origin");

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders(origin, env.ALLOWED_ORIGIN) });
		}

		const url = new URL(request.url);
		const path = url.pathname;
		const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

		if (request.method === "POST" && path === "/payhero-callback") {
			return handleCallback(request, env);
		}

		if (request.method === "POST" && path === "/verify-payment") {
			return verifyPayment(request, env, origin);
		}

		try {
			const body = await request.json<{
				amount: number;
				phone_number: string;
				external_reference?: string;
				customer_name?: string;
			}>();

			if (!body.amount || !body.phone_number) {
				return new Response(JSON.stringify({ error: "amount and phone_number are required" }), {
					status: 400,
					headers: { "Content-Type": "application/json", ...headers },
				});
			}

			if (typeof body.amount !== "number" || body.amount <= 0 || body.amount > 10000) {
				return new Response(JSON.stringify({ error: "Invalid amount" }), {
					status: 400,
					headers: { "Content-Type": "application/json", ...headers },
				});
			}

			let phone = body.phone_number.replace(/\D/g, "");
			if (phone.startsWith("0")) phone = phone.substring(1);
			if (!phone.startsWith("254")) phone = "254" + phone;

			if (phone.length < 9 || phone.length > 12) {
				return new Response(JSON.stringify({ error: "Invalid phone number" }), {
					status: 400,
					headers: { "Content-Type": "application/json", ...headers },
				});
			}

			const apiToken = env.PAYHERO_API_TOKEN;
			const channelId = env.PAYHERO_CHANNEL_ID || "8182";

			if (!apiToken) {
				return new Response(JSON.stringify({ error: "Payment processing unavailable" }), {
					status: 500,
					headers: { "Content-Type": "application/json", ...headers },
				});
			}

			const callbackOrigin = new URL(request.url).origin;

			const payheroBody = {
				amount: body.amount,
				phone_number: phone,
				channel_id: Number(channelId),
				provider: "m-pesa",
				external_reference: body.external_reference || `RH-${Date.now()}`,
				customer_name: body.customer_name || "Customer",
				callback_url: `${callbackOrigin}/payhero-callback`,
			};

			const response = await fetch(`${PAYHERO_API}/payments`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${apiToken}`,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify(payheroBody),
			});

			const data = await response.json();

			return new Response(JSON.stringify(data), {
				status: response.status,
				headers: { "Content-Type": "application/json", ...headers },
			});
		} catch (error) {
			return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }), {
				status: 500,
				headers: { "Content-Type": "application/json", ...headers },
			});
		}
	},
};
