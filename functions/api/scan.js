export async function onRequestPost(context) {
  const { imageData, mediaType } = await context.request.json();
  const apiKey = context.env.ANTHROPIC_API_KEY;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [{
          type: "image",
          source: { type: "base64", media_type: mediaType, data: imageData }
        }, {
          type: "text",
          text: "Read this golf scorecard and return JSON only with: course name, tees array (color, front9: {rating, slope, par}, back9: {rating, slope, par}), players array (name, front9holes array, back9holes array, front9total, back9total), holes (18 or 9). Return raw JSON only, no markdown."
        }]
      }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  return new Response(JSON.stringify({ result: text }), {
    headers: { "Content-Type": "application/json" }
  });
}