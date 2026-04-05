export default async (request) => {
  // Only allow POST
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { imageData, mediaType } = await request.json();

    if (!imageData || !mediaType) {
      return new Response(JSON.stringify({ error: "Missing imageData or mediaType" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageData }
            },
            {
              type: "text",
              text: `You are reading a golf scorecard image. Extract all data and return ONLY valid JSON with no markdown or explanation.

Return this exact structure:
{
  "course": "Course name",
  "holes": 9,
  "tees": [
    { "color": "Blue", "gender": "M", "front9": { "rating": 35.2, "slope": 118, "par": 36 }, "back9": { "rating": 34.8, "slope": 115, "par": 36 } }
  ],
  "players": [
    { "name": "Player name", "front9holes": [4,5,4,3,5,4,4,3,5], "back9holes": [4,4,5,3,4,5,3,4,4], "front9total": 37, "back9total": 36, "total18": 73 }
  ]
}

Rules:
- Extract every tee row visible (Black, Blue, White, Gold, Red, etc)
- For each tee extract front9 and back9 rating/slope/par separately
- If only 18-hole values visible, divide rating by 2, keep slope the same
- Extract every player row with name and scores
- Include hole-by-hole scores if visible, otherwise null
- If holes=9 only, set back9 fields to null
- Use null for any unreadable fields
- Return ONLY the JSON object, nothing else`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    return new Response(JSON.stringify({ result: clean }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/scan"
};
