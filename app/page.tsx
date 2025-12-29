"use client";

import React, { useMemo, useState } from "react";

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

type StepStatus = "unset" | "working" | "not_working";

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background: selected
          ? "rgba(137, 104, 255, 0.25)"
          : "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.92)",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: "18px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.06)",
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

export default function Page() {
  // Step tabs: Calm / Clarify / Choose
  const [tab, setTab] = useState<"Calm" | "Clarify" | "Choose">("Clarify");

  // Core scenario
  const [trigger, setTrigger] = useState("");
  const [goal, setGoal] = useState("");

  // Parent moods (multi select chips)
  const parentMoodOptions = useMemo(
    () => [
      "Impatient",
      "Annoyed",
      "Rushed",
      "Overwhelmed",
      "Triggered",
      "Angry",
    ],
    []
  );
  const [parentMoods, setParentMoods] = useState<string[]>([]);

  // Clarify additions
  const environmentOptions = useMemo(
    () => ["Home", "Car", "Park", "School", "Store", "Restaurant", "Outdoor"],
    []
  );
  const [environmentType, setEnvironmentType] = useState("Home");

  const [intensity, setIntensity] = useState(5); // 1-10
  const [timeLimitMin, setTimeLimitMin] = useState(10); // 0-60
  const [timeLimitNone, setTimeLimitNone] = useState(false); // NEW
  const [childAge, setChildAge] = useState(7); // 1-18
  const [constraintsNotes, setConstraintsNotes] = useState("");

  // NEW: child behavior chips
  const childBehaviorOptions = useMemo(
    () => [
      "Not listening",
      "Defiant",
      "Disrespectful",
      "Screaming",
      "Crying",
      "Whining",
      "Refusing",
      "Hitting/kicking",
      "Running away",
      "Tantrum/meltdown",
    ],
    []
  );
  const [childBehaviors, setChildBehaviors] = useState<string[]>([]);

  // NEW: second child option
  const [secondChildEnabled, setSecondChildEnabled] = useState(false);
  const [secondChildAge, setSecondChildAge] = useState(5);
  const [secondChildIntensity, setSecondChildIntensity] = useState(5);
  const [secondChildBehaviors, setSecondChildBehaviors] = useState<string[]>(
    []
  );

  const triedOptions = useMemo(
    () => [
      "Explained calmly",
      "Repeated reminders",
      "Offered choices",
      "Offered reward",
      "Tried humor",
      "Tried a break",
      "Tried ignoring",
      "Raised my voice",
    ],
    []
  );
  const [triedAlready, setTriedAlready] = useState<string[]>([]);

  // Guidance + card walkthrough
  const [loading, setLoading] = useState(false);
  const [guidance, setGuidance] = useState<GuidanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    Array(6).fill("unset")
  );

  const [isSolved, setIsSolved] = useState(false);

  // Step 6 unresolved flow
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [unresolvedDetails, setUnresolvedDetails] = useState("");

  function toggleInArray(arr: string[], value: string) {
    return arr.includes(value)
      ? arr.filter((x) => x !== value)
      : [...arr, value];
  }

  function basePayload() {
    return {
      moodOwner: "Parent",
      parentMoods,
      trigger,
      goal,
      environmentType,
      intensity,
      timeLimitMin,
      timeLimitNone,
      childAge,
      childBehaviors,
      secondChildEnabled,
      secondChildAge,
      secondChildIntensity,
      secondChildBehaviors,
      constraintsNotes,
      triedAlready,
    };
  }

  async function getGuidance() {
    setError(null);
    setLoading(true);
    setGuidance(null);
    setActiveStepIndex(0);
    setStepStatuses(Array(6).fill("unset"));
    setIsSolved(false);
    setShowUnresolved(false);
    setUnresolvedDetails("");

    const payload = basePayload();

    try {
      const res = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON. Raw: ${text.slice(0, 300)}`);
      }

      if (!res.ok) {
        const msg =
          (data &&
            typeof data === "object" &&
            "error" in data &&
            String((data as any).error)) ||
          `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const g = data as GuidanceResponse;
      if (!g?.steps || !Array.isArray(g.steps) || g.steps.length !== 6) {
        throw new Error(
          "OpenAI response shape missing steps[6]. Check /api/guidance output."
        );
      }

      setGuidance(g);
      setTab("Choose");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentStepOnly() {
    if (!guidance) return;

    const nextStatuses = [...stepStatuses];
    nextStatuses[activeStepIndex] = "not_working";
    setStepStatuses(nextStatuses);

    setLoading(true);
    try {
      const payload = {
        ...basePayload(),
        refreshStepNumber: activeStepIndex + 1,
        currentGuidance: guidance,
        notWorkingDetails: "",
      };

      const res = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON. Raw: ${text.slice(0, 300)}`);
      }

      if (!res.ok) {
        const msg =
          (data &&
            typeof data === "object" &&
            "error" in data &&
            String((data as any).error)) ||
          `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const updated = data as GuidanceResponse;
      if (
        !updated?.steps ||
        !Array.isArray(updated.steps) ||
        updated.steps.length !== 6
      ) {
        throw new Error("Step refresh returned invalid plan shape.");
      }

      setGuidance(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      window.alert(msg);
    } finally {
      setLoading(false);
    }
  }

  async function refreshPlanWithUnresolvedFeedback() {
    setLoading(true);
    try {
      const payload = {
        ...basePayload(),
        unresolvedDetails: unresolvedDetails.trim(),
      };

      const res = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON. Raw: ${text.slice(0, 300)}`);
      }

      if (!res.ok) {
        const msg =
          (data &&
            typeof data === "object" &&
            "error" in data &&
            String((data as any).error)) ||
          `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const g = data as GuidanceResponse;
      if (!g?.steps || !Array.isArray(g.steps) || g.steps.length !== 6) {
        throw new Error(
          "OpenAI response shape missing steps[6]. Check /api/guidance output."
        );
      }

      setGuidance(g);
      setActiveStepIndex(0);
      setStepStatuses(Array(6).fill("unset"));
      setShowUnresolved(false);
      setUnresolvedDetails("");
      setIsSolved(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      window.alert(msg);
    } finally {
      setLoading(false);
    }
  }

  function markStepAndAdvanceWorking() {
    if (!guidance || isSolved) return;

    const nextStatuses = [...stepStatuses];
    nextStatuses[activeStepIndex] = "working";
    setStepStatuses(nextStatuses);

    if (activeStepIndex >= 5) {
      setIsSolved(true);
      return;
    }
    setActiveStepIndex((i) => Math.min(5, i + 1));
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 20,
    background:
      "radial-gradient(1200px 800px at 10% 10%, rgba(137,104,255,0.22), transparent 45%), radial-gradient(900px 600px at 80% 30%, rgba(56,189,248,0.10), transparent 40%), #0b1020",
    color: "rgba(255,255,255,0.92)",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
  };

  return (
    <div style={containerStyle}>
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Calm Loop</div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              A guided reset loop for real-life parenting moments
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Chip
              label="1) Calm"
              selected={tab === "Calm"}
              onClick={() => setTab("Calm")}
            />
            <Chip
              label="2) Clarify"
              selected={tab === "Clarify"}
              onClick={() => setTab("Clarify")}
            />
            <Chip
              label="3) Choose"
              selected={tab === "Choose"}
              onClick={() => setTab("Choose")}
            />
          </div>
        </div>

        {tab === "Calm" && (
          <Card>
            <style jsx>{`
              @keyframes calmBreathe {
                0% {
                  transform: scale(0.88);
                  filter: brightness(0.95);
                }
                50% {
                  transform: scale(1.14);
                  filter: brightness(1.1);
                }
                100% {
                  transform: scale(0.88);
                  filter: brightness(0.95);
                }
              }
            `}</style>

            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Calm
            </div>
            <div style={{ opacity: 0.85, marginBottom: 14 }}>
              Use the breathing circle for a quick nervous-system reset. Inhale
              as it grows, exhale as it shrinks.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "18px 0 8px",
              }}
            >
              <div
                style={{
                  width: 170,
                  height: 170,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background:
                    "radial-gradient(circle at 30% 30%, rgba(137,104,255,0.35), rgba(255,255,255,0.06) 55%, rgba(255,255,255,0.02))",
                  animation: "calmBreathe 6.5s ease-in-out infinite",
                }}
              />
            </div>

            <div style={{ opacity: 0.82, textAlign: "center", marginTop: 6 }}>
              Try 3 slow breaths, then move on.
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Chip
                label="Go to Clarify →"
                selected={false}
                onClick={() => setTab("Clarify")}
              />
            </div>
          </Card>
        )}

        {tab === "Clarify" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Clarify
              </div>
              <div style={{ opacity: 0.8, marginBottom: 16 }}>
                Capture the moment in plain language. The goal is to reduce
                reactivity and increase clarity.
              </div>

              <div style={{ marginTop: 2 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>
                  Parent mood selector
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {parentMoodOptions.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt}
                      selected={parentMoods.includes(opt)}
                      onClick={() =>
                        setParentMoods((prev) => toggleInArray(prev, opt))
                      }
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>
                  Trigger *
                </div>
                <textarea
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  placeholder='Example: "They refused to eat lunch unless they got candy first."'
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>Goal *</div>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder='Example: "Calm lunch transition and get one healthy bite."'
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>
                  Environment type
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {environmentOptions.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt}
                      selected={environmentType === opt}
                      onClick={() => setEnvironmentType(opt)}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>
                  Child behavior (select any)
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {childBehaviorOptions.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt}
                      selected={childBehaviors.includes(opt)}
                      onClick={() =>
                        setChildBehaviors((prev) => toggleInArray(prev, opt))
                      }
                    />
                  ))}
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 650, marginBottom: 6 }}>
                    Intensity level: {intensity}/10
                  </div>
                  <div
                    style={{
                      opacity: 0.72,
                      marginBottom: 8,
                      lineHeight: "18px",
                    }}
                  >
                    1 = minor friction • 5 = hard moment (tears/raised voices) •
                    10 = near-loss of control / safety risk
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 650, marginBottom: 8 }}>
                    Time limit: {timeLimitNone ? "None" : `${timeLimitMin} min`}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <Chip
                      label="None"
                      selected={timeLimitNone}
                      onClick={() => {
                        setTimeLimitNone(true);
                        setTimeLimitMin(0);
                      }}
                    />
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={timeLimitMin}
                    onChange={(e) => {
                      setTimeLimitMin(Number(e.target.value));
                      setTimeLimitNone(false);
                    }}
                    disabled={timeLimitNone}
                    style={{ width: "100%", opacity: timeLimitNone ? 0.5 : 1 }}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 650, marginBottom: 8 }}>
                    Child age: {childAge}
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={18}
                    value={childAge}
                    onChange={(e) => setChildAge(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 650, marginBottom: 8 }}>
                    Second child
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Chip
                      label={
                        secondChildEnabled
                          ? "Second child: On"
                          : "Add second child"
                      }
                      selected={secondChildEnabled}
                      onClick={() => setSecondChildEnabled((v) => !v)}
                    />
                  </div>
                </div>
              </div>

              {secondChildEnabled && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 750, marginBottom: 10 }}>
                    Second child details
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 650, marginBottom: 8 }}>
                        Second child age: {secondChildAge}
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={18}
                        value={secondChildAge}
                        onChange={(e) =>
                          setSecondChildAge(Number(e.target.value))
                        }
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div>
                      <div style={{ fontWeight: 650, marginBottom: 6 }}>
                        Second child intensity: {secondChildIntensity}/10
                      </div>
                      <div
                        style={{
                          opacity: 0.72,
                          marginBottom: 8,
                          lineHeight: "18px",
                        }}
                      >
                        1 = minor friction • 5 = hard moment • 10 = near-loss of
                        control / safety risk
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={secondChildIntensity}
                        onChange={(e) =>
                          setSecondChildIntensity(Number(e.target.value))
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 650, marginBottom: 8 }}>
                      Second child behavior (select any)
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {childBehaviorOptions.map((opt) => (
                        <Chip
                          key={opt}
                          label={opt}
                          selected={secondChildBehaviors.includes(opt)}
                          onClick={() =>
                            setSecondChildBehaviors((prev) =>
                              toggleInArray(prev, opt)
                            )
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>
                  What I’ve tried already
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {triedOptions.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt}
                      selected={triedAlready.includes(opt)}
                      onClick={() =>
                        setTriedAlready((prev) => toggleInArray(prev, opt))
                      }
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>
                  Constraints (optional)
                </div>
                <input
                  value={constraintsNotes}
                  onChange={(e) => setConstraintsNotes(e.target.value)}
                  placeholder='Example: "We’re late, sibling nearby, can’t raise voice."'
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                    outline: "none",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <Chip
                  label="← Back"
                  selected={false}
                  onClick={() => setTab("Calm")}
                />
                <button
                  type="button"
                  onClick={getGuidance}
                  disabled={loading}
                  style={{
                    marginLeft: "auto",
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(137,104,255,0.55)",
                    background: loading
                      ? "rgba(137,104,255,0.18)"
                      : "rgba(137,104,255,0.30)",
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Generating..." : "Get Guidance →"}
                </button>
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,120,120,0.35)",
                    background: "rgba(255,120,120,0.10)",
                    color: "rgba(255,220,220,0.92)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === "Choose" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <Card>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {guidance ? guidance.planTitle : "Guidance"}
                  </div>
                  {guidance && (
                    <div style={{ opacity: 0.82, marginTop: 4 }}>
                      <strong>State:</strong> {guidance.likelyState} •{" "}
                      {guidance.oneLineSummary}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Chip
                    label="← Back to Clarify"
                    selected={false}
                    onClick={() => setTab("Clarify")}
                  />
                  <button
                    type="button"
                    onClick={getGuidance}
                    disabled={loading}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(137,104,255,0.55)",
                      background: loading
                        ? "rgba(137,104,255,0.18)"
                        : "rgba(137,104,255,0.30)",
                      color: "rgba(255,255,255,0.92)",
                      fontWeight: 700,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Refreshing..." : "Refresh with AI"}
                  </button>
                </div>
              </div>

              {guidance &&
                guidance.safetyNote &&
                guidance.safetyNote.trim() && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255,220,120,0.25)",
                      background: "rgba(255,220,120,0.08)",
                    }}
                  >
                    <strong>Safety note:</strong> {guidance.safetyNote}
                  </div>
                )}
            </Card>

            {guidance && (
              <Card>
                {isSolved ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      Marked as solved
                    </div>
                    <div style={{ opacity: 0.85, lineHeight: "20px" }}>
                      If you want, you can refresh with AI to create a follow-up
                      plan for preventing this next time.
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        marginTop: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsSolved(false);
                          setActiveStepIndex(0);
                          setStepStatuses(Array(6).fill("unset"));
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.92)",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        Start over
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800 }}>
                        Step {activeStepIndex + 1} of 6
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveStepIndex((i) => Math.max(0, i - 1))
                          }
                          disabled={activeStepIndex === 0}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.92)",
                            cursor:
                              activeStepIndex === 0 ? "not-allowed" : "pointer",
                            opacity: activeStepIndex === 0 ? 0.6 : 1,
                          }}
                        >
                          ← Previous
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveStepIndex((i) => Math.min(5, i + 1))
                          }
                          disabled={activeStepIndex === 5}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.92)",
                            cursor:
                              activeStepIndex === 5 ? "not-allowed" : "pointer",
                            opacity: activeStepIndex === 5 ? 0.6 : 1,
                          }}
                        >
                          Next →
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      {(() => {
                        const s = guidance.steps[activeStepIndex];
                        const isFinal = activeStepIndex === 5;

                        return (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                justifyContent: "space-between",
                                gap: 12,
                              }}
                            >
                              <div style={{ fontSize: 18, fontWeight: 800 }}>
                                {s.title}
                              </div>
                              <div style={{ opacity: 0.8, fontWeight: 650 }}>
                                {s.timeBox}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                                Do
                              </div>
                              <div style={{ opacity: 0.9, lineHeight: "20px" }}>
                                {s.parentDo}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                                Say
                              </div>
                              <div
                                style={{
                                  opacity: 0.95,
                                  lineHeight: "20px",
                                  padding: 10,
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "rgba(255,255,255,0.04)",
                                }}
                              >
                                {s.parentSay}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                                Success check
                              </div>
                              <div style={{ opacity: 0.9, lineHeight: "20px" }}>
                                {s.successCheck}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                                If not working
                              </div>
                              <div style={{ opacity: 0.9, lineHeight: "20px" }}>
                                {s.ifNotWorking}
                              </div>
                            </div>

                            {!isFinal ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  marginTop: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={markStepAndAdvanceWorking}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border:
                                      "1px solid rgba(80, 220, 160, 0.35)",
                                    background:
                                      stepStatuses[activeStepIndex] ===
                                      "working"
                                        ? "rgba(80, 220, 160, 0.22)"
                                        : "rgba(80, 220, 160, 0.10)",
                                    color: "rgba(255,255,255,0.92)",
                                    cursor: "pointer",
                                    fontWeight: 750,
                                  }}
                                >
                                  Working
                                </button>

                                <button
                                  type="button"
                                  onClick={refreshCurrentStepOnly}
                                  disabled={loading}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border:
                                      "1px solid rgba(255, 120, 120, 0.35)",
                                    background:
                                      stepStatuses[activeStepIndex] ===
                                      "not_working"
                                        ? "rgba(255, 120, 120, 0.20)"
                                        : "rgba(255, 120, 120, 0.10)",
                                    color: "rgba(255,255,255,0.92)",
                                    cursor: loading ? "not-allowed" : "pointer",
                                    fontWeight: 750,
                                    opacity: loading ? 0.7 : 1,
                                  }}
                                >
                                  Not working
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setIsSolved(true)}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,0.16)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "rgba(255,255,255,0.92)",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                  }}
                                >
                                  Problem solved
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  marginTop: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setIsSolved(true)}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border:
                                      "1px solid rgba(80, 220, 160, 0.35)",
                                    background: "rgba(80, 220, 160, 0.10)",
                                    color: "rgba(255,255,255,0.92)",
                                    cursor: "pointer",
                                    fontWeight: 750,
                                  }}
                                >
                                  Problem solved
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setShowUnresolved((v) => !v)}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border:
                                      "1px solid rgba(255, 120, 120, 0.35)",
                                    background: "rgba(255, 120, 120, 0.10)",
                                    color: "rgba(255,255,255,0.92)",
                                    cursor: "pointer",
                                    fontWeight: 750,
                                  }}
                                >
                                  Problem unresolved
                                </button>
                              </div>
                            )}

                            {isFinal && showUnresolved && (
                              <div
                                style={{
                                  marginTop: 10,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 10,
                                }}
                              >
                                <div style={{ fontWeight: 750 }}>
                                  What didn’t work? (optional)
                                </div>
                                <textarea
                                  value={unresolvedDetails}
                                  onChange={(e) =>
                                    setUnresolvedDetails(e.target.value)
                                  }
                                  placeholder='Example: "They escalated when I offered choices, and they refused any food options."'
                                  rows={3}
                                  style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "rgba(255,255,255,0.92)",
                                    outline: "none",
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={refreshPlanWithUnresolvedFeedback}
                                  disabled={loading}
                                  style={{
                                    padding: "10px 14px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(137,104,255,0.55)",
                                    background: loading
                                      ? "rgba(137,104,255,0.18)"
                                      : "rgba(137,104,255,0.30)",
                                    color: "rgba(255,255,255,0.92)",
                                    fontWeight: 700,
                                    cursor: loading ? "not-allowed" : "pointer",
                                    alignSelf: "flex-start",
                                  }}
                                >
                                  {loading
                                    ? "Refreshing..."
                                    : "Refresh full plan with feedback →"}
                                </button>
                              </div>
                            )}

                            <div style={{ marginTop: 10, opacity: 0.85 }}>
                              <strong>Progress:</strong>{" "}
                              {stepStatuses
                                .map(
                                  (st, i) =>
                                    `${i + 1}:${
                                      st === "unset"
                                        ? "—"
                                        : st === "working"
                                        ? "✓"
                                        : "×"
                                    }`
                                )
                                .join("  ")}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </Card>
            )}

            {!guidance && (
              <Card>
                <div style={{ opacity: 0.85 }}>
                  No guidance yet. Go to Clarify and click “Get Guidance”.
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
