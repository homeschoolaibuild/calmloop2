import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(status: number, data: unknown) {
  return NextResponse.json(data, { status });
}

type GuidanceStep = {
  stepNumber: number;
  title: string;
  parentDo: string;
  parentSay: string;
  successCheck: string;
  ifNotWorking: string;
  timeBox: string;
};

type GuidanceResponse = {
  planTitle: string;
  likelyState:
    | "Regulated"
    | "Activated"
    | "Overwhelmed"
    | "Shutdown"
    | "Escalating";
  oneLineSummary: string;
  safetyNote: string;
  steps: GuidanceStep[];
  optionalAddOns: string[];
};

type IncomingBody = {
  // Core
  moodOwner?: "Parent" | "Child" | string;
  mood?: string;
  parentMoods?: string[];
  trigger?: string;
  goal?: string;

  // Clarify inputs
  environmentType?: string;
  intensity?: number; // 1-10
  timeLimitMin?: number; // 0-60
  timeLimitNone?: boolean; // NEW
  childAge?: number; // 1-18
  constraintsNotes?: string;

  // NEW: child behavior chips
  childBehaviors?: string[];

  // NEW: second child option
  secondChildEnabled?: boolean;
  secondChildAge?: number; // 1-18
  secondChildIntensity?: number; // 1-10
  secondChildBehaviors?: string[];

  // Optional “what tried already”
  triedAlready?: string[];

  // Step-only refresh
  refreshStepNumber?: number; // 1-6
  currentGuidance?: GuidanceResponse;
  notWorkingDetails?: string;

  // Full refresh with feedback (Step 6 unresolved)
  unresolvedDetails?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

/**
 * Responses API can return aggregated `output_text`, or text inside `output[].content[]`.
 * This extractor handles both shapes.
 */
function extractModelText(resp: unknown): string | null {
  if (!resp || typeof resp !== "object") return null;
  const r = resp as Record<string, unknown>;

  const outputText = r["output_text"];
  if (typeof outputText === "string" && outputText.trim()) return outputText;

  const output = r["output"];
  if (!Array.isArray(output)) return null;

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const content = it["content"];
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const cc = c as Record<string, unknown>;
      const text = cc["text"];
      if (typeof text === "string" && text) parts.push(text);
    }
  }

  const joined = parts.join("").trim();
  return joined ? joined : null;
}

function isGuidanceStep(x: unknown): x is GuidanceStep {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.stepNumber === "number" &&
    typeof s.title === "string" &&
    typeof s.parentDo === "string" &&
    typeof s.parentSay === "string" &&
    typeof s.successCheck === "string" &&
    typeof s.ifNotWorking === "string" &&
    typeof s.timeBox === "string"
  );
}

export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  return json(200, {
    ok: true,
    route: "/api/guidance",
    hasOpenAIKey: hasKey,
    hint: hasKey
      ? "POST JSON to this endpoint to generate guidance."
      : "Set OPENAI_API_KEY in your server environment variables and restart/redeploy.",
  });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(500, {
        error: "Missing OPENAI_API_KEY on the server.",
        fix: "Add OPENAI_API_KEY to your environment variables and restart/redeploy.",
      });
    }

    const body = (await req.json().catch(() => null)) as IncomingBody | null;
    if (!body) return json(400, { error: "Invalid JSON body." });

    // Parent-only mood selector: lock to Parent.
    const moodOwner: "Parent" = "Parent";

    const parentMoods = normalizeStringArray(body.parentMoods);
    const trigger = String(body.trigger ?? "").trim();
    const goal = String(body.goal ?? "").trim();

    // Clarify
    const environmentType = String(body.environmentType ?? "Home").trim();
    const intensity = clamp(Number(body.intensity ?? 5) || 5, 1, 10);

    const timeLimitNone = !!body.timeLimitNone;
    const timeLimitMin = clamp(Number(body.timeLimitMin ?? 10) || 10, 0, 60);

    const childAge = clamp(Number(body.childAge ?? 7) || 7, 1, 18);
    const constraintsNotes = String(body.constraintsNotes ?? "").trim();

    const childBehaviors = normalizeStringArray(body.childBehaviors);

    const secondChildEnabled = !!body.secondChildEnabled;
    const secondChildAge = clamp(Number(body.secondChildAge ?? 5) || 5, 1, 18);
    const secondChildIntensity = clamp(
      Number(body.secondChildIntensity ?? 5) || 5,
      1,
      10
    );
    const secondChildBehaviors = normalizeStringArray(
      body.secondChildBehaviors
    );

    const triedAlready = normalizeStringArray(body.triedAlready);

    if (!trigger || trigger.length < 3 || !goal || goal.length < 3) {
      return json(400, { error: "Missing required fields: trigger and goal." });
    }

    // -------- Step-only refresh mode --------
    const refreshStepNumberRaw = Number(body.refreshStepNumber);
    const refreshStepNumber =
      Number.isFinite(refreshStepNumberRaw) &&
      refreshStepNumberRaw >= 1 &&
      refreshStepNumberRaw <= 6
        ? refreshStepNumberRaw
        : null;

    const currentGuidance = body.currentGuidance;
    const notWorkingDetails = String(body.notWorkingDetails ?? "").trim();
    const unresolvedDetails = String(body.unresolvedDetails ?? "").trim();

    if (
      refreshStepNumber &&
      currentGuidance &&
      Array.isArray(currentGuidance.steps) &&
      currentGuidance.steps.length === 6
    ) {
      const idx = refreshStepNumber - 1;
      const existingStep = currentGuidance.steps[idx];

      // Schema for ONE step replacement
      const stepSchema = {
        type: "object",
        additionalProperties: false,
        properties: {
          step: {
            type: "object",
            additionalProperties: false,
            properties: {
              stepNumber: { type: "integer", minimum: 1, maximum: 6 },
              title: { type: "string" },
              parentDo: { type: "string" },
              parentSay: { type: "string" },
              successCheck: { type: "string" },
              ifNotWorking: { type: "string" },
              timeBox: { type: "string" },
            },
            required: [
              "stepNumber",
              "title",
              "parentDo",
              "parentSay",
              "successCheck",
              "ifNotWorking",
              "timeBox",
            ],
          },
        },
        required: ["step"],
      } as const;

      const systemStep = [
        "You are Calm Loop, a supportive parenting micro-coach.",
        "Goal: regenerate ONLY one step in a 6-step plan to make it more effective and specific.",
        "Style: calm, clear, non-judgmental. Simple language. No shaming.",
        "Return ONLY valid JSON that matches the provided JSON schema exactly.",
        "Do NOT include markdown, extra keys, commentary, or surrounding text.",
        "Keep the step short and actionable: what to do + what to say + success check + what to try if it still doesn't work.",
        "The regenerated step must stay consistent with the overall plan tone and constraints.",
        "Account for child behaviors and any second child details if provided.",
      ].join("\n");

      const userPayloadStep = {
        mode: "refresh_step_only",
        stepToReplace: refreshStepNumber,
        scenario: {
          moodOwner,
          parentMoods,
          trigger,
          goal,
          environmentType,
          intensityLevel1to10: intensity,
          timeLimitNone,
          timeLimitMinutes: timeLimitNone ? null : timeLimitMin,
          childAge,
          childBehaviors,
          secondChildEnabled,
          secondChild: secondChildEnabled
            ? {
                age: secondChildAge,
                intensityLevel1to10: secondChildIntensity,
                behaviors: secondChildBehaviors,
              }
            : null,
          constraintsNotes,
          triedAlready,
        },
        planContext: {
          planTitle: currentGuidance.planTitle,
          likelyState: currentGuidance.likelyState,
          oneLineSummary: currentGuidance.oneLineSummary,
          safetyNote: currentGuidance.safetyNote,
        },
        currentStep: existingStep,
        whatDidntWork:
          notWorkingDetails || "The parent marked this step as not working.",
        instruction:
          "Regenerate ONLY this step so it is more workable given the exact scenario and constraints. Do not reference other steps explicitly.",
      };

      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-2024-07-18",
          input: [
            { role: "system", content: systemStep },
            { role: "user", content: JSON.stringify(userPayloadStep) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "calm_loop_step_refresh",
              strict: true,
              schema: stepSchema,
            },
          },
          temperature: 0.35,
          max_output_tokens: 450,
        }),
      });

      const raw = await resp.text();

      if (!resp.ok) {
        return json(resp.status, {
          error: "OpenAI API error (step refresh)",
          status: resp.status,
          details: raw.slice(0, 4000),
        });
      }

      let responseJson: unknown;
      try {
        responseJson = JSON.parse(raw);
      } catch {
        return json(502, {
          error: "OpenAI response was not valid JSON (step refresh).",
          debug: raw.slice(0, 4000),
        });
      }

      const modelText = extractModelText(responseJson);
      if (!modelText) {
        return json(502, {
          error:
            "Unexpected OpenAI response shape (could not extract model text) (step refresh).",
          debug: raw.slice(0, 4000),
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(modelText);
      } catch {
        return json(502, {
          error: "Model returned invalid JSON (step refresh).",
          raw: modelText.slice(0, 4000),
        });
      }

      if (!parsed || typeof parsed !== "object") {
        return json(502, {
          error: "Parsed step refresh output was not an object.",
          raw: modelText.slice(0, 2000),
        });
      }

      const p = parsed as Record<string, unknown>;
      const step = p.step;

      if (!isGuidanceStep(step)) {
        return json(502, {
          error: "Step refresh output missing required step fields.",
          raw: modelText.slice(0, 4000),
        });
      }

      // Enforce correct stepNumber
      const fixedStep: GuidanceStep = {
        ...step,
        stepNumber: refreshStepNumber,
      };

      const updated: GuidanceResponse = {
        ...currentGuidance,
        steps: currentGuidance.steps.map((s, i) => (i === idx ? fixedStep : s)),
      };

      return json(200, updated);
    }

    // -------- Normal full-plan generation (also used for unresolved refresh) --------
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        planTitle: { type: "string" },
        likelyState: {
          type: "string",
          enum: [
            "Regulated",
            "Activated",
            "Overwhelmed",
            "Shutdown",
            "Escalating",
          ],
        },
        oneLineSummary: { type: "string" },
        safetyNote: { type: "string" },
        steps: {
          type: "array",
          minItems: 6,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              stepNumber: { type: "integer", minimum: 1, maximum: 6 },
              title: { type: "string" },
              parentDo: { type: "string" },
              parentSay: { type: "string" },
              successCheck: { type: "string" },
              ifNotWorking: { type: "string" },
              timeBox: { type: "string" },
            },
            required: [
              "stepNumber",
              "title",
              "parentDo",
              "parentSay",
              "successCheck",
              "ifNotWorking",
              "timeBox",
            ],
          },
        },
        optionalAddOns: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "planTitle",
        "likelyState",
        "oneLineSummary",
        "safetyNote",
        "steps",
        "optionalAddOns",
      ],
    } as const;

    const system = [
      "You are Calm Loop, a supportive parenting micro-coach.",
      "Goal: give practical, specific guidance a parent can apply immediately.",
      "Style: calm, clear, non-judgmental. Simple language. No shaming.",
      "Return ONLY valid JSON that matches the provided JSON schema exactly.",
      "Do NOT include markdown, extra keys, commentary, or surrounding text.",
      "Write steps that are highly specific to the situation and constraints.",
      "Each step must include: what to do, what to say, how to check success, and what to try if it doesn't work.",
      "Account for child behaviors and any second child details if provided.",
      "If there is any immediate danger, the first step must prioritize safety and de-escalation.",
      unresolvedDetails
        ? "IMPORTANT: The user said the prior plan was unresolved. Adapt this new plan to address what didn't work."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const userPayload = {
      moodOwner,
      parentMoods,
      trigger,
      goal,
      environmentType,
      intensityLevel1to10: intensity,
      timeLimitNone,
      timeLimitMinutes: timeLimitNone ? null : timeLimitMin,
      childAge,
      childBehaviors,
      secondChildEnabled,
      secondChild: secondChildEnabled
        ? {
            age: secondChildAge,
            intensityLevel1to10: secondChildIntensity,
            behaviors: secondChildBehaviors,
          }
        : null,
      constraintsNotes,
      triedAlready,
      unresolvedDetails: unresolvedDetails || "",
      instruction: unresolvedDetails
        ? "Generate a revised 6-step plan that directly addresses what didn't work previously and offers more workable alternatives."
        : "Generate a 6-step plan that feels like a guided walkthrough, not generic tips.",
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-2024-07-18",
        input: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "calm_loop_guidance",
            strict: true,
            schema,
          },
        },
        temperature: 0.35,
        max_output_tokens: 1000,
      }),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      return json(resp.status, {
        error: "OpenAI API error",
        status: resp.status,
        details: raw.slice(0, 4000),
      });
    }

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(raw);
    } catch {
      return json(502, {
        error: "OpenAI response was not valid JSON (unexpected).",
        debug: raw.slice(0, 4000),
      });
    }

    const modelText = extractModelText(responseJson);
    if (!modelText) {
      return json(502, {
        error:
          "Unexpected OpenAI response shape (could not extract model text).",
        debug: raw.slice(0, 4000),
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(modelText);
    } catch {
      const trimmed = modelText.trim();
      const maybeObject = trimmed.startsWith("{") ? trimmed : `{${trimmed}}`;
      try {
        parsed = JSON.parse(maybeObject);
      } catch {
        return json(502, {
          error: "Model returned invalid JSON (could not parse).",
          raw: modelText.slice(0, 4000),
        });
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return json(502, {
        error: "Parsed output was not an object.",
        raw: modelText.slice(0, 2000),
      });
    }

    const p = parsed as Record<string, unknown>;
    if (!Array.isArray(p.steps) || p.steps.length !== 6) {
      return json(502, {
        error: "Parsed output missing steps[6].",
        raw: modelText.slice(0, 4000),
      });
    }

    return json(200, parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return json(500, { error: message });
  }
}
