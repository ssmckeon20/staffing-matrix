// AI Assistant Edge Function — calls Gemini 3.5 Flash-Lite
// To switch AI providers, replace the GEMINI API CALL block below.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are ShiftLine AI, a scheduling and workforce planning assistant for hospital transportation departments. You help managers analyze schedules, find coverage gaps, plan hiring, and propose schedule changes.

You receive a structured summary of the current scheduling period including:
- Assignment groups (job duty groups with operating hours)
- Team members (names, groups, hourly rates, overtime thresholds)
- Shift assignments (who works when, with times and status)
- Volume plans (hourly coverage targets per group)
- Company holidays

RULES:
1. Answer questions clearly and concisely using the data provided.
2. When the user asks to move, remove, or modify a schedule, you MUST respond with a "proposal" object — never claim to have made changes. Changes require user approval in the UI.
3. For analysis questions (gaps, overtime risk, costs, coverage), provide specific numbers and actionable recommendations.
4. Use bullet points (•) for lists of shifts or people.
5. Keep responses focused — no unnecessary preamble or filler.
6. If asked about something not in the data, say so honestly.
7. For cost estimates, multiply hours by the member's hourly_rate.

PROPOSAL FORMAT:
When proposing a schedule change, include a JSON block at the END of your response in this exact format:
<<<PROPOSAL>>>
{"type":"move","memberName":"Jane Diaz","fromDate":"2025-01-06","toDate":"2025-01-08","shiftStart":"06:00","shiftEnd":"14:00"}
<<<END_PROPOSAL>>>

Supported proposal types:
- "move": move a member's shift from one date to another (fields: memberName, fromDate, toDate, shiftStart, shiftEnd)
- "remove": remove a member's shifts for a date range (fields: memberName, fromDate, toDate)
- "addoff": mark a member as off on a specific date (fields: memberName, date)

Always explain the proposal in plain text BEFORE the JSON block. Only include one proposal per response.`;

interface ScheduleData {
  groups: { id: string; name: string; hours_start: string; hours_end: string }[];
  members: { id: string; name: string; group_id: string; hourly_rate: number; overtime_threshold: number; weekly_hours: number }[];
  assignments: { member_id: string; group_id: string; date: string; shift_start: string | null; shift_end: string | null; status: string }[];
  volumePlans: { group_id: string; enabled: boolean; productivity_rate: number; weekend_multiplier: number; hourly_volume: number[]; manual_staff: number[] }[];
  holidays: { date: string; name: string }[];
  periodStart: string;
  periodEnd: string;
}

function buildContextText(data: ScheduleData): string {
  const lines: string[] = [];

  lines.push(`SCHEDULING PERIOD: ${data.periodStart} to ${data.periodEnd}\n`);

  lines.push("ASSIGNMENT GROUPS:");
  for (const g of data.groups) {
    lines.push(`  - ${g.name} (ID: ${g.id}): hours ${g.hours_start}–${g.hours_end}`);
  }

  lines.push("\nTEAM MEMBERS:");
  for (const m of data.members) {
    const group = data.groups.find((g) => g.id === m.group_id);
    lines.push(`  - ${m.name} (ID: ${m.id}, group: ${group?.name || "unknown"}, rate: $${m.hourly_rate}/hr, OT after ${m.overtime_threshold}hrs, expected ${m.weekly_hours}hrs/wk)`);
  }

  lines.push("\nVOLUME PLANS (coverage targets):");
  for (const vp of data.volumePlans) {
    const group = data.groups.find((g) => g.id === vp.group_id);
    if (vp.enabled) {
      lines.push(`  - ${group?.name || vp.group_id}: enabled, productivity ${vp.productivity_rate}/hr, weekend mult ${vp.weekend_multiplier}`);
    }
  }

  lines.push("\nSHIFT ASSIGNMENTS:");
  const byDate: Record<string, typeof data.assignments> = {};
  for (const a of data.assignments) {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  }
  for (const date of Object.keys(byDate).sort()) {
    const shifts = byDate[date];
    const shiftLines = shifts.map((a) => {
      const m = data.members.find((x) => x.id === a.member_id);
      const g = data.groups.find((x) => x.id === a.group_id);
      const timeStr = a.shift_start && a.shift_end ? `${a.shift_start}–${a.shift_end}` : "off";
      return `    ${m?.name || "Unknown"} — ${timeStr} (${a.status}, ${g?.name || "?"})`;
    });
    lines.push(`  ${date}:`);
    lines.push(...shiftLines);
  }

  if (data.holidays.length > 0) {
    lines.push("\nCOMPANY HOLIDAYS:");
    for (const h of data.holidays) {
      lines.push(`  - ${h.date}: ${h.name}`);
    }
  }

  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { question, scheduleData, conversationHistory } = await req.json() as {
      question: string;
      scheduleData: ScheduleData;
      conversationHistory?: { role: string; text: string }[];
    };

    if (!question || !scheduleData) {
      return new Response(
        JSON.stringify({ error: "Missing question or scheduleData" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contextText = buildContextText(scheduleData);

    // Build conversation contents for Gemini
    const contents: { role: string; parts: { text: string }[] }[] = [];

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.text }],
        });
      }
    }

    // Add the current question with context
    contents.push({
      role: "user",
      parts: [{ text: `SCHEDULE DATA:\n${contextText}\n\nQUESTION: ${question}` }],
    });

    // ============ AI PROVIDER — change this block to switch models ============
    // Currently using Google Gemini 3.5 Flash-Lite (free tier available, $0.30/$2.50 per 1M tokens)
    const GEMINI_MODEL = "gemini-3.5-flash-lite";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`;

    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `AI service returned an error (${geminiResponse.status}). Please try again.` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const geminiData = await geminiResponse.json();
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response. Please try rephrasing your question.";
    // ============ END AI PROVIDER BLOCK ============

    // Extract proposal from response if present
    let text = aiText;
    let proposal: { type: string; memberName: string; [key: string]: string } | null = null;

    const proposalMatch = aiText.match(/<<<PROPOSAL>>>\s*(\{[\s\S]*?\})\s*<<<END_PROPOSAL>>>/);
    if (proposalMatch) {
      try {
        proposal = JSON.parse(proposalMatch[1]);
        text = aiText.replace(/<<<PROPOSAL>>>[\s\S]*?<<<END_PROPOSAL>>>/, "").trim();
      } catch {
        // If JSON parse fails, just return the full text
      }
    }

    return new Response(
      JSON.stringify({ text, proposal }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred while contacting the AI service." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
