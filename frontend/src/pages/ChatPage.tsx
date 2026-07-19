import React, { useState, useRef, useEffect } from "react";
import {
  Send, ChevronDown, ChevronUp, Sparkles, BookOpen, Layers,
  FileText, FileSpreadsheet, File, ExternalLink, AlertTriangle, Menu, X
} from "lucide-react";
import MessageBubble, { cleanChunkText } from "../components/MessageBubble";
import GroundingBadge from "../components/GroundingBadge";
import CausalChainView from "../components/CausalChainView";
import AuditTrail from "../components/AuditTrail";
import PerformanceBar from "../components/PerformanceBar";
import DocumentViewer, { type CitationInfo } from "../components/DocumentViewer";

interface VerifiedResult {
  category: string;
  icon: string;
  label: string;
  message: string;
  color: string;
}

interface ContradictionResult extends VerifiedResult {
  claim?: string;
  source_a?: string;
  source_b?: string;
}

interface VerificationResults {
  verified: VerifiedResult[];
  contradictions: ContradictionResult[];
}

interface Conflict {
  claim: string;
  source_a: string;
  source_b: string;
}

interface Message {
  id: string;
  sender: "user" | "system";
  text: string;
  groundingScore?: number;
  sentenceHighlights?: Array<{ sentence: string; score: number; highlight_color: string }>;
  conflicts?: Conflict[];
  citations?: CitationInfo[];
  causalChain?: Array<{ equipment: string; component: string; failure: string; symptom: string; action?: string }>;
  auditTrail?: Array<{ agent_name: string; action_taken: string; timestamp: string }>;
  queryTimeMs?: number;
  graphMs?: number;
  vectorMs?: number;
  llmMs?: number;
  verifyMs?: number;
  groundingNote?: string;
  verificationResults?: VerificationResults;
}

interface ChatPageProps {
  initialQuestion?: string;
  onQuestionConsumed?: () => void;
}

function getFileExt(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

// ─── Citation Card ────────────────────────────────────────────────────────────
function CitationCard({ citation, index, onClick }: {
  citation: CitationInfo;
  index: number;
  onClick: () => void;
}) {
  const ext = getFileExt(citation.filename);
  const isPdf = ext === "pdf";
  const isDocx = ["docx", "doc"].includes(ext);
  const isXlsx = ["xlsx", "xls"].includes(ext);

  const badgeColor = isPdf
    ? "bg-red-50 text-red-700 border-red-200"
    : isDocx ? "bg-blue-50 text-blue-700 border-blue-200"
    : isXlsx ? "bg-green-50 text-green-700 border-green-200"
    : "bg-slate-100 text-slate-600 border-slate-200";

  const IconEl = isPdf || isDocx ? FileText : isXlsx ? FileSpreadsheet : File;
  const iconColor = isPdf ? "text-red-500" : isDocx ? "text-blue-500" : isXlsx ? "text-green-600" : "text-slate-400";
  const docLabel = isPdf ? "PDF" : isDocx ? "Word" : isXlsx ? "Excel" : "Doc";

  const cleanedText = citation.chunk_text ? cleanChunkText(citation.chunk_text) : "";

  return (
    <div
      className="citation-card group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-label={`Open ${citation.filename} at page ${citation.page_number}`}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <IconEl size={18} className={`${iconColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate leading-snug">
            {citation.filename}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${badgeColor}`}>
              Page {citation.page_number}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">{docLabel}</span>
            <span className="text-[10px] text-slate-500 font-mono">· [{index + 1}]</span>
          </div>
        </div>
      </div>

      {cleanedText && (
        <p className="text-xs text-slate-600 italic leading-snug line-clamp-2 mb-2.5">
          "{cleanedText}"
        </p>
      )}

      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink size={12} />
        Open Source Document →
      </div>
    </div>
  );
}

// ─── Conflict Card (FIX 6) ────────────────────────────────────────────────────
function ConflictCard({ conflicts }: { conflicts: Conflict[] }) {
  if (!conflicts || conflicts.length === 0) return null;

  return (
    <div className="border-l-4 border-red-500 bg-red-50 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-red-600 shrink-0" />
        <div>
          <p className="font-bold text-red-700 text-sm">
            Factual Conflict Detected
          </p>
          <p className="text-xs text-red-600 mt-0.5">
            The answer contains claims that contradict your verified Knowledge Graph.
          </p>
        </div>
      </div>

      {/* Conflict rows */}
      <div className="space-y-2 px-4 pb-4">
        {conflicts.map((c, i) => {
          // Extract a short topic from claim (strip Cypher notation if present)
          const topic = c.claim
            .replace(/\([^)]*\)/g, "")
            .replace(/\[:[A-Z_]+\]/g, "")
            .replace(/->/g, "")
            .trim()
            .split(/[\n-]/)[0]
            .trim() || "Conflict";

          const answerSays = c.source_a
            .replace(/Generated Answer/i, "")
            .replace(/\([^)]*\)-?\[?:?[A-Z_]*\]?->?\(?[^)]*\)?/g, "")
            .trim() || c.source_a;

          const graphSays = c.source_b
            .replace(/Knowledge Graph:/i, "")
            .replace(/\([^)]*\)-?\[?:?[A-Z_]*\]?->?\(?[^)]*\)?/g, "")
            .trim() || c.source_b;

          return (
            <div key={i} className="bg-white rounded-lg border border-red-200 overflow-hidden shadow-sm">
              <div className="bg-red-100 px-4 py-2 text-xs font-bold text-red-700 border-b border-red-200">
                ⚠ Conflict: {topic}
              </div>
              <div className="grid grid-cols-2 divide-x divide-red-100">
                <div className="px-4 py-3">
                  <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Answer claims
                  </p>
                  <p className="text-xs text-slate-800 leading-snug">{answerSays}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Knowledge Graph says
                  </p>
                  <p className="text-xs text-green-800 leading-snug font-medium">{graphSays}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Verification Panel (FIX 4) ───────────────────────────────────────────────
function VerificationPanel({ results }: { results?: VerificationResults }) {
  const [verifiedOpen, setVerifiedOpen] = useState(false);

  if (!results) return null;
  const { verified, contradictions } = results;
  if (verified.length === 0 && contradictions.length === 0) return null;

  // Convert raw graph message to human-readable summary
  const toReadable = (msg: string): string => {
    // Pattern: "Graph confirms: (EntityA)-[:RELATION]->(EntityB)"
    const match = msg.match(/Graph confirms:\s*\(([^)]+)\)-\[:([A-Z_]+)\]->\(([^)]+)\)/i);
    if (match) {
      const [, e1, rel, e2] = match;
      const relReadable: Record<string, string> = {
        CAUSED_BY: "caused by",
        PART_OF: "is part of",
        EXHIBITED_SYMPTOM: "exhibited symptom",
        RESOLVED: "resolved",
        GOVERNED_BY: "governed by",
        MAINTAINED_BY: "maintained by",
        DOCUMENTED_IN: "documented in",
        PERFORMED_BY: "performed by",
        HAS_COMPONENT: "has component",
        HAS_ROOT_CAUSE: "root cause is",
        HAS_STATUS: "status",
      };
      return `✓ ${e1} → ${relReadable[rel] ?? rel.toLowerCase().replace(/_/g, " ")} ${e2} — confirmed in Knowledge Graph`;
    }
    return `✓ ${msg.replace(/Graph confirms:\s*/i, "")}`;
  };

  return (
    <div className="space-y-2">
      {/* Verified — collapsible green card */}
      {verified.length > 0 && (
        <div className="rounded-xl border border-green-200 overflow-hidden">
          <button
            onClick={() => setVerifiedOpen(!verifiedOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-green-50 hover:bg-green-100 transition-colors cursor-pointer"
          >
            <span className="text-xs font-semibold text-green-700">
              ✅ {verified.length} fact{verified.length !== 1 ? "s" : ""} verified against Knowledge Graph
            </span>
            {verifiedOpen
              ? <ChevronUp size={13} className="text-green-600" />
              : <ChevronDown size={13} className="text-green-600" />}
          </button>
          {verifiedOpen && (
            <div className="bg-green-50/50 border-t border-green-200 px-4 py-3 space-y-1.5">
              {verified.map((v, i) => (
                <p key={i} className="text-xs text-green-800 leading-snug">
                  {toReadable(v.message)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expander ────────────────────────────────────────────────────────────────
function Expander({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-600 font-mono cursor-pointer border-b border-slate-200"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && <div className="p-4 bg-white">{children}</div>}
    </div>
  );
}

// ─── Time Ago Formatter ────────────────────────────────────────────────────────
function formatTimeAgo(dateStr: string) {
  if (!dateStr) return "";
  try {
    const normalizedStr = dateStr.includes(" ") ? dateStr.replace(" ", "T") : dateStr;
    const date = new Date(normalizedStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return "";
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  } catch (e) {
    return "";
  }
}

// ─── Main ChatPage ────────────────────────────────────────────────────────────
export default function ChatPage({ initialQuestion, onQuestionConsumed }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [viewerCitation, setViewerCitation] = useState<CitationInfo | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = async () => {
    try {
      const res = await fetch("http://localhost:8000/chat/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const loadSessionHistory = async (sessId: string) => {
    if (!sessId) return;
    try {
      const res = await fetch(`http://localhost:8000/chat/history?session_id=${encodeURIComponent(sessId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: Message[] = data.map((item: any) => {
            const meta = item.metadata || {};
            return {
              id: item.id?.toString() || Math.random().toString(),
              sender: item.role === "user" ? "user" : "system",
              text: item.content,
              groundingScore: meta.grounding_score,
              sentenceHighlights: [],
              conflicts: [],
              citations: [],
              causalChain: [],
              auditTrail: [],
              queryTimeMs: meta.query_time_ms,
              verificationResults: { verified: [], contradictions: [] }
            };
          });
          setMessages(mapped);
          setHistoryCount(mapped.length);
        }
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
    }
  };

  useEffect(() => {
    let sessId = localStorage.getItem("ki_current_session");
    if (!sessId) {
      sessId = crypto.randomUUID();
      localStorage.setItem("ki_current_session", sessId);
    }
    setCurrentSessionId(sessId);
    fetchSessions();
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      loadSessionHistory(currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (initialQuestion) {
      setInput(initialQuestion);
      onQuestionConsumed?.();
    }
  }, [initialQuestion]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleNewChat = () => {
    const newSessId = crypto.randomUUID();
    localStorage.setItem("ki_current_session", newSessId);
    setCurrentSessionId(newSessId);
    setMessages([]);
    setHistoryCount(0);
    fetchSessions();
    setSidebarOpen(false);
  };

  const handleSelectSession = (sessId: string) => {
    localStorage.setItem("ki_current_session", sessId);
    setCurrentSessionId(sessId);
    setSidebarOpen(false);
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear chat history?")) return;
    try {
      const res = await fetch("http://localhost:8000/chat/history", {
        method: "DELETE"
      });
      if (res.ok) {
        setMessages([]);
        setHistoryCount(0);
        fetchSessions();
      } else {
        alert("Failed to clear chat history.");
      }
    } catch (err) {
      console.error("Failed to clear history:", err);
      alert("Failed to clear chat history.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { id: Math.random().toString(), sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setLoadingStep("Extracting query entities...");
    fetchSessions();

    const timers = [
      setTimeout(() => setLoadingStep("Traversing Knowledge Graph relationships..."), 1200),
      setTimeout(() => setLoadingStep("Performing vector similarity search..."), 2500),
      setTimeout(() => setLoadingStep("Drafting answer with Claude-3.5-Sonnet..."), 3800),
      setTimeout(() => setLoadingStep("Evaluating grounding score & fact-checking..."), 5000),
    ];

    try {
      const res = await fetch("http://localhost:8000/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage.text, session_id: currentSessionId }),
      });
      const data = await res.json();
      timers.forEach(clearTimeout);

      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: "system",
            text: data.answer,
            groundingScore: data.grounding_score,
            sentenceHighlights: data.sentence_highlights,
            conflicts: data.conflicts,
            citations: data.citations || [],
            causalChain: data.causal_chain,
            auditTrail: data.audit_trail,
            queryTimeMs: data.query_time_ms,
            graphMs: data.graph_retrieval_ms,
            vectorMs: data.vector_retrieval_ms,
            llmMs: data.llm_generation_ms,
            verifyMs: data.verification_ms,
            groundingNote: data.grounding_note || "",
            verificationResults: data.verification_results ?? { verified: [], contradictions: [] },
          },
        ]);
        fetchSessions();
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Math.random().toString(), sender: "system", text: `Error: ${data.detail || "Unknown error"}` },
        ]);
      }
    } catch {
      timers.forEach(clearTimeout);
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), sender: "system", text: "Failed to connect to the backend agent service." },
      ]);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <>
      <div className="flex-1 flex overflow-hidden relative h-full">
        {/* Sidebar Panel */}
        <div
          className={`
            fixed inset-y-0 left-0 z-40 w-[260px] bg-white border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-300 md:static md:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          {/* Sidebar Top: Conversations label & New Chat button */}
          <div className="p-4 border-b border-slate-100 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                💬 Conversations
              </span>
              {/* Close button for mobile overlay */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <button
              onClick={handleNewChat}
              className="w-full py-2 px-4 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles size={14} />
              New Chat
            </button>
          </div>

          {/* Sidebar Body: Sessions list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((sess) => {
              const isActive = sess.session_id === currentSessionId;
              const textTruncated =
                sess.first_message.length > 35
                  ? sess.first_message.slice(0, 35) + "..."
                  : sess.first_message || "New Conversation";
              const timeLabel = formatTimeAgo(sess.created_at);

              return (
                <div
                  key={sess.session_id}
                  onClick={() => handleSelectSession(sess.session_id)}
                  className={`
                    group flex flex-col gap-1 p-3 rounded-xl cursor-pointer transition-all border-l-2
                    ${
                      isActive
                        ? "bg-violet-50/70 border-violet-600 text-slate-800"
                        : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    }
                  `}
                >
                  <p className="text-xs font-semibold leading-snug truncate">
                    {textTruncated}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400 font-mono">
                    <span>{timeLabel}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {sess.message_count} msg
                    </span>
                  </div>
                </div>
              );
            })}
            
            {sessions.length === 0 && (
              <p className="text-xs text-slate-400 text-center mt-6">
                No conversation history.
              </p>
            )}
          </div>
        </div>

        {/* Mobile Sidebar Backdrop Overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-xs md:hidden"
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 h-full">
          {/* Header/Status Bar with Hamburger */}
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              {/* Hamburger Toggle Button for mobile */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                title="Toggle Sidebar"
              >
                <Menu size={20} />
              </button>
              
              <div className="flex items-center gap-2">
                {historyCount !== null && historyCount > 0 && (
                  <>
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-violet-50 text-violet-600 font-bold text-[10px] font-mono border border-violet-100">
                      {historyCount}
                    </span>
                    <p className="text-xs text-slate-600 font-semibold font-sans">
                      Previous messages loaded from database history
                    </p>
                  </>
                )}
              </div>
            </div>
            
            {historyCount !== null && historyCount > 0 && (
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 text-rose-700 hover:text-rose-800 font-bold text-xs rounded-lg transition-all duration-200 cursor-pointer shadow-sm"
              >
                Clear History
              </button>
            )}
          </div>

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <Sparkles size={36} className="text-violet-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Trust-Verified Reasoning Layer</h3>
                  <p className="text-sm text-slate-600 mt-2">
                    Ask structural failure, root-cause, or regulation compliance queries. Every claim is cross-checked against the Neo4j Knowledge Graph and ChromaDB documents.
                  </p>
                </div>
                <div className="grid grid-cols-1 w-full gap-3 text-left font-mono text-xs">
                  <button
                    onClick={() => setInput("Why did Boiler-12 fail? Explain root cause.")}
                    className="bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-300 p-3 rounded-lg text-slate-700 transition-colors text-left cursor-pointer shadow-sm"
                  >
                    ⚡ "Why did Boiler-12 fail? Explain root cause."
                  </button>
                  <button
                    onClick={() => setInput("What standard regulations govern Boiler-12?")}
                    className="bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-300 p-3 rounded-lg text-slate-700 transition-colors text-left cursor-pointer shadow-sm"
                  >
                    📖 "What standard regulations govern Boiler-12?"
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-4xl mx-auto">
                {messages.map((msg) => (
                  <div key={msg.id} className="space-y-4">
                    <MessageBubble
                      sender={msg.sender}
                      text={msg.text}
                      highlights={msg.sentenceHighlights}
                      citations={msg.citations}
                      onCitationClick={setViewerCitation}
                    />

                    {msg.sender === "system" && msg.groundingScore !== undefined && (
                      <div className="ml-12 pl-4 border-l-2 border-slate-200 space-y-4">
                        {/* Timing bar */}
                        {msg.queryTimeMs && msg.queryTimeMs > 0 && (
                          <PerformanceBar
                            queryTimeMs={msg.queryTimeMs}
                            graphMs={msg.graphMs ?? 0}
                            vectorMs={msg.vectorMs ?? 0}
                            llmMs={msg.llmMs ?? 0}
                            verifyMs={msg.verifyMs ?? 0}
                          />
                        )}

                        {/* Grounding badge + count */}
                        <div className="flex flex-wrap items-center gap-3">
                          <GroundingBadge score={msg.groundingScore} />
                          <span className="text-xs text-slate-600 font-mono">
                            Verified across {msg.citations?.length || 0} document chunks
                          </span>
                        </div>

                        {/* Grounding note */}
                        {msg.groundingNote && (
                          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-mono">
                            <span className="shrink-0 mt-0.5">⚠️</span>
                            <span>{msg.groundingNote}</span>
                          </div>
                        )}

                        {/* FIX 6: Conflict card appears ABOVE citations when conflicts exist */}
                        {msg.conflicts && msg.conflicts.length > 0 && (
                          <ConflictCard conflicts={msg.conflicts} />
                        )}

                        {/* FIX 4: Clean verification panel (verified only, no new_info) */}
                        <VerificationPanel results={msg.verificationResults} />

                        {/* RCA Causal Chain */}
                        {msg.causalChain && msg.causalChain.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <h4 className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider mb-3">
                              Structured Causal Root-Cause Chain
                            </h4>
                            <CausalChainView chain={msg.causalChain} />
                          </div>
                        )}

                        {/* Expanders */}
                        <div className="flex gap-3">
                          <Expander title="Citations" icon={<BookOpen size={14} />}>
                            {msg.citations && msg.citations.length > 0 ? (
                              <div className="space-y-3 mt-1">
                                {msg.citations.map((cit, i) => (
                                  <CitationCard
                                    key={i}
                                    citation={cit}
                                    index={i}
                                    onClick={() => setViewerCitation(cit)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 mt-2">No references cited.</p>
                            )}
                          </Expander>

                          <Expander title="Reasoning Path" icon={<Layers size={14} />}>
                            {msg.auditTrail && msg.auditTrail.length > 0 ? (
                              <div className="mt-1">
                                <AuditTrail trail={msg.auditTrail} />
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 mt-2">No execution steps logged.</p>
                            )}
                          </Expander>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT */}
          <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white">
            <div className="max-w-4xl mx-auto flex gap-3 relative items-center">
              {loading && (
                <div className="absolute -top-12 left-0 right-0 mx-auto w-max text-xs font-mono bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1 rounded-full flex items-center gap-2 animate-bounce shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-ping" />
                  {loadingStep}
                </div>
              )}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about equipment failures, symptoms, or compliance mappings..."
                className="flex-1 bg-white border border-slate-200 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 text-sm text-slate-800 rounded-xl px-4 py-3.5 pr-12 transition-all placeholder:text-slate-400 shadow-sm"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="absolute right-2.5 p-2 bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 disabled:bg-slate-200 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white rounded-lg transition-all cursor-pointer shadow-sm"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* DOCUMENT VIEWER MODAL */}
      <DocumentViewer citation={viewerCitation} onClose={() => setViewerCitation(null)} />
    </>
  );
}
