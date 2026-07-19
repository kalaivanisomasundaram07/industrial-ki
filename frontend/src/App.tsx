import React, { useState, useEffect } from "react";
import {
  MessageSquare, Network, ClipboardList,
  Layers, Activity, CloudUpload
} from "lucide-react";
import ChatPage from "./pages/ChatPage";
import GraphPage from "./pages/GraphPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import MaintenanceDashboard from "./pages/MaintenanceDashboard";
import WarningsBanner from "./components/WarningsBanner";
import UploadModal from "./components/UploadModal";

type ActiveTab = "chat" | "graph" | "review" | "maintenance";

interface Warning {
  warning_title: string;
  affected_equipment: string[];
  pattern_description: string;
  recommendation: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [graphStats, setGraphStats] = useState<{
    total_nodes: number;
    total_relationships: number;
    nodes_by_type: Record<string, number>;
  }>({
    total_nodes: 0,
    total_relationships: 0,
    nodes_by_type: {},
  });

  // Cross-page question injection: ask AI from Maintenance/Graph tabs
  const [injectedQuestion, setInjectedQuestion] = useState<string | undefined>(undefined);

  // Active warnings for the banner
  const [warnings, setWarnings] = useState<Warning[]>([]);

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchStatsAndQueue = async () => {
    try {
      const reviewRes = await fetch("http://localhost:8000/review-queue");
      if (reviewRes.ok) {
        const queueData = await reviewRes.json();
        setPendingCount(queueData.length);
      }

      const statsRes = await fetch("http://localhost:8000/graph/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setGraphStats(statsData);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
  };

  const fetchWarnings = async () => {
    try {
      const res = await fetch("http://localhost:8000/intelligence/warnings");
      if (res.ok) {
        const data = await res.json();
        setWarnings(data);
      }
    } catch (err) {
      console.error("Failed to fetch warnings:", err);
    }
  };

  useEffect(() => {
    fetchStatsAndQueue();
    fetchWarnings();
    const interval = setInterval(() => {
      fetchStatsAndQueue();
      fetchWarnings();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAskAI = (question: string) => {
    setInjectedQuestion(question);
    setActiveTab("chat");
  };

  const handleDismissWarning = (idx: number) => {
    setWarnings((prev) => prev.filter((_, i) => i !== idx));
  };

  // After a successful upload, refresh stats & warnings
  const handleUploadSuccess = () => {
    setTimeout(() => {
      fetchStatsAndQueue();
      fetchWarnings();
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-2 rounded-lg shadow text-white">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Industrial Knowledge Intelligence
              <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-mono">
                v2.0 TRUST-LAYER
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Verified Reasoning &amp; Knowledge Graph System
            </p>
          </div>
        </div>

        {/* UPLOAD BUTTON */}
        <div className="flex items-center w-full md:w-auto">
          <button
            onClick={() => setUploadOpen(true)}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-md shadow-violet-200 hover:shadow-violet-300 transition-all cursor-pointer"
          >
            <CloudUpload size={17} />
            Upload Documents
          </button>
        </div>
      </header>

      {/* DASHBOARD STATS BANNER */}
      <section className="bg-white px-4 sm:px-6 py-3 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
        <div>
          <span className="text-slate-500">Total Nodes:</span>{" "}
          <span className="text-violet-700 font-bold">{graphStats.total_nodes}</span>
        </div>
        <div>
          <span className="text-slate-500">Relationships:</span>{" "}
          <span className="text-teal-700 font-bold">
            {graphStats.total_relationships}
          </span>
        </div>
        <div className="col-span-2 truncate">
          <span className="text-slate-500">Equipment / Failures:</span>{" "}
          <span className="text-amber-700 font-bold">
            {graphStats.nodes_by_type["Equipment"] || 0} /{" "}
            {graphStats.nodes_by_type["Failure"] || 0}
          </span>
        </div>
      </section>

      {/* WARNINGS BANNER */}
      <WarningsBanner warnings={warnings} onDismiss={handleDismissWarning} />

      {/* TAB NAVIGATION */}
      <nav className="flex justify-center border-b border-slate-200 bg-slate-100">
        <div className="flex gap-1 sm:gap-2 p-2 w-full max-w-5xl">
          {(
            [
              { id: "chat", label: "Chat Assistant", icon: <MessageSquare size={16} /> },
              { id: "graph", label: "Knowledge Graph", icon: <Network size={16} /> },
              { id: "review", label: "Review Queue", icon: <ClipboardList size={16} />, badge: pendingCount },
              { id: "maintenance", label: "Maintenance", icon: <Activity size={16} /> },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 sm:px-4 rounded-lg font-medium text-xs sm:text-sm transition-all cursor-pointer relative ${
                activeTab === tab.id
                  ? "bg-white text-violet-700 border border-slate-200 shadow-sm border-b-2 border-b-violet-600"
                  : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
              {"badge" in tab && tab.badge > 0 && (
                <span className="absolute -top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white animate-pulse">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* VIEWPORT */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "chat" && (
          <ChatPage
            initialQuestion={injectedQuestion}
            onQuestionConsumed={() => setInjectedQuestion(undefined)}
          />
        )}
        {activeTab === "graph" && (
          <GraphPage
            stats={graphStats}
            onAskAboutPattern={handleAskAI}
          />
        )}
        {activeTab === "review" && (
          <ReviewQueuePage onQueueUpdated={fetchStatsAndQueue} />
        )}
        {activeTab === "maintenance" && (
          <MaintenanceDashboard onAskAboutEquipment={handleAskAI} />
        )}
      </main>

      {/* UPLOAD MODAL */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
