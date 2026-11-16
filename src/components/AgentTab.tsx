import { useState, useRef, useEffect } from "react";
import { Icon } from "./ui";
import { loadContext, answerQuestion, type ScheduleContext, type Proposal } from "../lib/assistant";
import { useAuth } from "../lib/auth";
import { formatDateISO } from "../lib/helpers";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  proposal?: Proposal;
  proposalState?: "pending" | "approved" | "declined";
  suggestions?: string[];
}

const GREETING = "Hi! I'm your scheduling assistant. I can answer questions about the current schedule and propose changes — nothing gets modified without your approval. Try asking:";

const EXAMPLES = [
  "Where do I have the most gaps?",
  "What would happen if I removed Sheila Bonilla from this week's schedule?",
  "I need to hire a new transporter, what shift do we most need the coverage?",
  "Can you give me a list of all employees who worked on the last holiday?",
];

export default function AgentTab() {
  const { canEdit } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [periodStart, setPeriodStart] = useState<Date>(() => {
    const stored = typeof localStorage !== "undefined" && localStorage.getItem("payPeriodStart");
    return stored ? new Date(stored + "T00:00:00") : new Date();
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<ScheduleContext | null>(null);

  // Two-week default window aligned to the pay period
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(periodStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const sendMessage = async (raw: string) => {
    const question = raw.trim();
    if (!question || thinking) return;
    setInput("");
    setError("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setThinking(true);
    try {
      if (!ctxRef.current) {
        ctxRef.current = await loadContext(dates);
      }
      const answer = await answerQuestion(question, ctxRef.current);
      setMessages((prev) => [...prev, {
        role: "assistant",
        text: answer.text,
        proposal: answer.proposal,
        proposalState: answer.proposal ? "pending" : undefined,
        suggestions: answer.suggestions,
      }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setThinking(false);
    }
  };

  const handleProposal = async (msgIndex: number, approved: boolean) => {
    const msg = messages[msgIndex];
    if (!msg?.proposal || msg.proposalState !== "pending") return;
    if (approved && !canEdit) return;
    if (approved) {
      try {
        const result = await msg.proposal.apply();
        setMessages((prev) => prev.map((m, i) =>
          i === msgIndex ? { ...m, proposalState: "approved", text: `${m.text}\n\n✔ ${result}` } : m
        ));
      } catch (e) {
        setError(String(e));
      }
    } else {
      setMessages((prev) => prev.map((m, i) =>
        i === msgIndex ? { ...m, proposalState: "declined" } : m
      ));
    }
  };

  const refreshData = async () => {
    ctxRef.current = null;
    await sendMessage("Give me an overview of the current schedule");
  };

  return (
    <div className="page agent-page">
      <section className="page-heading">
        <div>
          <div className="title-row">
            <h1>AI Assistant</h1>
            <span className="status-pill">Beta</span>
          </div>
          <p>Ask Questions About Schedules, Find Gaps, And Request Changes — All Changes Require Your Approval.</p>
        </div>
        <div className="heading-actions">
          <button className="date-control" onClick={() => {
            const prev = new Date(periodStart);
            prev.setDate(prev.getDate() - 14);
            setPeriodStart(prev);
            ctxRef.current = null;
          }}>
            <Icon name="calendar" />
            <span>{formatDateISO(dates[0])} – {formatDateISO(dates[dates.length - 1])}</span>
          </button>
          <button className="date-control" onClick={() => {
            const next = new Date(periodStart);
            next.setDate(next.getDate() + 14);
            setPeriodStart(next);
            ctxRef.current = null;
          }}>
            <span>Next →</span>
          </button>
          <button className="button button-secondary" onClick={refreshData} title="Reload schedule data and get an overview">
            <Icon name="refresh" size={14} /> Refresh data
          </button>
        </div>
      </section>

      <div className="agent-chat-card">
        <div className="agent-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="agent-greeting">
              <div className="agent-greeting-icon"><Icon name="sparkles" size={22} /></div>
              <p>{GREETING}</p>
              <div className="agent-suggestions">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="agent-suggestion-chip" onClick={() => sendMessage(ex)}>{ex}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`agent-msg agent-msg-${msg.role}`}>
              {msg.role === "assistant" && (
                <div className="agent-avatar"><Icon name="sparkles" size={13} /></div>
              )}
              <div className="agent-bubble">
                <div className="agent-text">
                  {msg.text.split("\n").map((line, li) => (
                    <p key={li} className={line.startsWith("•") ? "agent-line-item" : ""}>{line || "\u00A0"}</p>
                  ))}
                </div>
                {msg.proposal && (
                  <div className={`agent-proposal ${msg.proposalState || ""}`}>
                    <div className="agent-proposal-head">
                      <Icon name={msg.proposalState === "approved" ? "check" : msg.proposalState === "declined" ? "x" : "alert"} size={14} />
                      <strong>{msg.proposal.title}</strong>
                    </div>
                    <p>{msg.proposal.detail}</p>
                    {msg.proposalState === "pending" && (
                      <div className="agent-proposal-actions">
                        <button className="agent-approve" onClick={() => handleProposal(i, true)}>
                          <Icon name="check" size={13} /> Approve & apply
                        </button>
                        <button className="agent-decline" onClick={() => handleProposal(i, false)}>Decline</button>
                      </div>
                    )}
                    {msg.proposalState === "approved" && <span className="agent-proposal-status approved">Applied — visible in the Staffing Matrix as a draft change</span>}
                    {msg.proposalState === "declined" && <span className="agent-proposal-status declined">Declined — nothing was changed</span>}
                  </div>
                )}
                {msg.suggestions && msg.proposalState !== "declined" && (
                  <div className="agent-suggestions">
                    {msg.suggestions.map((s) => (
                      <button key={s} className="agent-suggestion-chip" onClick={() => sendMessage(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="agent-msg agent-msg-assistant">
              <div className="agent-avatar"><Icon name="sparkles" size={13} /></div>
              <div className="agent-bubble"><span className="agent-typing">Analyzing schedule<span className="agent-dot">.</span><span className="agent-dot">.</span><span className="agent-dot">.</span></span></div>
            </div>
          )}
          {error && <div className="error-banner"><Icon name="alert" size={16} /> {error}</div>}
        </div>
        <div className="agent-input-bar">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="Ask about schedules, gaps, holidays, or request a change..."
            disabled={thinking}
          />
          <button className="agent-send" onClick={() => sendMessage(input)} disabled={thinking || !input.trim()}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
