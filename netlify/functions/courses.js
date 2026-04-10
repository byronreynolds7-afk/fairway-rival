export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { query } = await request.json();
    if (!query || query.length < 3) {
      return new Response(JSON.stringify({ courses: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Golf Course API — free tier, USGA accurate ratings/slopes
    const url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        "Authorization": `Key ${process.env.GOLF_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!resp.ok) {
      // Fallback: return empty so manual entry still works
      return new Response(JSON.stringify({ courses: [], fallback: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await resp.json();

    // Normalize to our format
    const courses = (data.courses || []).slice(0, 8).map(c => ({
      id: c.id,
      name: c.club_name,
      location: `${c.location?.city || ""}, ${c.location?.state || ""}`.trim().replace(/^,|,$/g, ""),
      tees: (c.tees || []).map(t => ({
        color: t.tee_name,
        gender: t.gender === "F" ? "W" : "M",
        front9: t.ratings?.find(r => r.holes === 9 && r.set === "front") || null,
        back9:  t.ratings?.find(r => r.holes === 9 && r.set === "back")  || null,
        full18: t.ratings?.find(r => r.holes === 18) || null,
      })).map(t => ({
        ...t,
        // If no 9-hole rating, derive from 18
        front9: t.front9 || (t.full18 ? {
          rating: parseFloat((t.full18.rating / 2).toFixed(1)),
          slope:  t.full18.slope,
          par:    t.full18.par ? Math.round(t.full18.par / 2) : 36
        } : null),
        back9: t.back9 || (t.full18 ? {
          rating: parseFloat((t.full18.rating / 2).toFixed(1)),
          slope:  t.full18.slope,
          par:    t.full18.par ? Math.round(t.full18.par / 2) : 36
        } : null),
      }))
    }));

    return new Response(JSON.stringify({ courses }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ courses: [], error: err.message }), {
      status: 200, // Return 200 so app falls back gracefully
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/courses"
};
