import React, { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle, MessageSquare, Activity, Zap } from "lucide-react";

interface RiskItem {
  equipment_name: string;
  risk_score: number;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  failure_count: number;
  symptom_count: number;
  action_count: number;
  has_unresolved: boolean;
  explanation: string;
  last_failure_date: string | null;
}

interface PerfStats {
  total_queries: number;
  avg_query_time_ms: number;
  avg_grounding_score: number;
  queries_with_conflicts: number;
}

interface MaintenanceDashboardProps {
  onAskAboutEquipment: (question: string) => void;
}

const RISK_CONFIG = {
  HIGH: {
    border: "border-l-4 border-l-red-500 border-r border-t border-b border-red-200",
    badge: "bg-red-100 text-red-700 border-red-200",
    text: "text-red-600",
    bar: "bg-red-500",
    track: "bg-red-100",
    summary: "bg-red-50 border-red-200",
    summaryText: "text-red-700",
    summaryNum: "text-red-600",
    unresolved: "bg-red-50 border border-red-200 text-red-700",
  },
  MEDIUM: {
    border: "border-l-4 border-l-amber-500 border-r border-t border-b border-amber-200",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    text: "text-amber-600",
    bar: "bg-amber-500",
    track: "bg-amber-100",
    summary: "bg-amber-50 border-amber-200",
    summaryText: "text-amber-700",
    summaryNum: "text-amber-600",
    unresolved: "bg-amber-50 border border-amber-200 text-amber-800",
  },
  LOW: {
    border: "border-l-4 border-l-green-500 border-r border-t border-b border-green-200",
    badge: "bg-green-100 text-green-700 border-green-200",
    text: "text-green-600",
    bar: "bg-green-500",
    track: "bg-green-100",
    summary: "bg-green-50 border-green-200",
    summaryText: "text-green-700",
    summaryNum: "text-green-600",
    unresolved: "bg-green-50 border border-green-200 text-green-800",
  },
};

export default function MaintenanceDashboard({ onAskAboutEquipment }: MaintenanceDashboardProps) {
  const [items, setItems] = useState<RiskItem[]>([]);
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [riskRes, perfRes] = await Promise.all([
        fetch("http://localhost:8000/maintenance/risk"),
        fetch("http://localhost:8000/stats/performance"),
      ]);

      if (riskRes.ok) {
        const data = await riskRes.json();
        setItems(data);
      }
      if (perfRes.ok) {
        const pData = await perfRes.json();
        setPerfStats(pData);
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Maintenance dashboard load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const highCount = items.filter((i) => i.risk_level === "HIGH").length;
  const medCount = items.filter((i) => i.risk_level === "MEDIUM").length;
  const lowCount = items.filter((i) => i.risk_level === "LOW").length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity size={20} className="text-violet-600" />
            Predictive Maintenance Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Equipment risk scores computed from Knowledge Graph failure data. Auto-refreshes every 60s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] font-mono text-slate-400">Updated: {lastUpdated}</span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer shadow-sm"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS ROW */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-l-4 border-l-red-500 border-red-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{highCount}</p>
          <p className="text-xs text-red-500 mt-1 font-mono uppercase tracking-wide">HIGH Risk</p>
        </div>
        <div className="bg-white border border-l-4 border-l-amber-500 border-amber-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{medCount}</p>
          <p className="text-xs text-amber-500 mt-1 font-mono uppercase tracking-wide">MEDIUM Risk</p>
        </div>
        <div className="bg-white border border-l-4 border-l-green-500 border-green-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{lowCount}</p>
          <p className="text-xs text-green-500 mt-1 font-mono uppercase tracking-wide">LOW Risk</p>
        </div>
      </div>

      {/* PERFORMANCE STATS PANEL */}
      {perfStats && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <Zap size={13} className="text-violet-600" />
            System Performance vs Traditional Search
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Avg Query Time</p>
              <p className="text-lg font-bold text-violet-700">{(perfStats.avg_query_time_ms / 1000).toFixed(2)}s</p>
              <p className="text-[10px] text-green-600">vs 15–30 min traditional</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Total Queries</p>
              <p className="text-lg font-bold text-slate-800">{perfStats.total_queries}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Avg Grounding</p>
              <p className="text-lg font-bold text-green-600">{(perfStats.avg_grounding_score * 100).toFixed(1)}%</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Conflict Rate</p>
              <p className="text-lg font-bold text-amber-600">
                {perfStats.total_queries > 0
                  ? ((perfStats.queries_with_conflicts / perfStats.total_queries) * 100).toFixed(1)
                  : 0}%
              </p>
            </div>
          </div>
          {/* Speed comparison bar */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono text-slate-400">Speed comparison (lower is better)</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="text-[10px] w-20 text-slate-500 font-mono">IKI System</span>
                <div className="flex-1 bg-slate-200 rounded-full h-2">
                  <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${Math.min((perfStats.avg_query_time_ms / 30000) * 100, 8)}%`, minWidth: "4px" }} />
                </div>
                <span className="text-[10px] text-violet-700 font-mono">{(perfStats.avg_query_time_ms / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] w-20 text-slate-500 font-mono">Traditional</span>
                <div className="flex-1 bg-slate-200 rounded-full h-2">
                  <div className="bg-slate-400 h-2 rounded-full w-full" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">15–30 min</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EQUIPMENT RISK CARDS */}
      {loading && items.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-400 text-xs font-mono">
          Loading risk data from Knowledge Graph...
        </div>
      ) : items.length === 0 ? (
        <div className="h-40 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-xs text-center px-6 bg-white">
          No equipment data found. Ingest documents to populate the knowledge graph.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const cfg = RISK_CONFIG[item.risk_level] || RISK_CONFIG.LOW;
            const scorePercent = Math.round(item.risk_score * 100);
            return (
              <div
                key={item.equipment_name}
                className={`bg-white rounded-xl p-4 space-y-3 shadow-sm ${cfg.border}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-800 text-sm leading-tight">{item.equipment_name}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full font-mono font-bold text-[10px] border uppercase ${cfg.badge}`}>
                    {item.risk_level}
                  </span>
                </div>

                {/* Risk score bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Risk Score</span>
                    <span className={cfg.text}>{scorePercent}%</span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${cfg.track}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-3 text-[10px] font-mono text-slate-500">
                  <span>⚡ {item.failure_count} failures</span>
                  <span>🔍 {item.symptom_count} symptoms</span>
                  <span>✅ {item.action_count} resolved</span>
                </div>

                {item.has_unresolved && (
                  <div className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded ${cfg.unresolved}`}>
                    <AlertTriangle size={10} />
                    Unresolved failures present
                  </div>
                )}

                {/* Explanation */}
                <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
                  {item.explanation}
                </p>

                {/* Ask AI button */}
                <button
                  onClick={() =>
                    onAskAboutEquipment(
                      `What is the maintenance history of ${item.equipment_name}? What failures occurred and what actions were taken?`
                    )
                  }
                  className="w-full flex items-center justify-center gap-1.5 bg-violet-50 hover:bg-violet-600 border border-violet-200 hover:border-violet-600 text-violet-700 hover:text-white text-[11px] font-medium py-2 rounded-lg transition-all cursor-pointer"
                >
                  <MessageSquare size={12} />
                  Ask AI about {item.equipment_name}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
