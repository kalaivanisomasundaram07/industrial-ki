import React, { useState, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Search, Info, HelpCircle, TrendingUp, RefreshCw } from "lucide-react";
import ComplianceGapTable from "../components/ComplianceGapTable";
import PatternCard from "../components/PatternCard";
import ComplianceReportModal from "../components/ComplianceReportModal";
import { API_URL } from "../config";

interface Node {
  id: string;
  name: string;
  label: string;
}

interface Link {
  source: string | Node;
  target: string | Node;
  type: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface GraphPageProps {
  stats: {
    total_nodes: number;
    total_relationships: number;
    nodes_by_type: Record<string, number>;
  };
  onAskAboutPattern?: (question: string) => void;
}

export default function GraphPage({ stats, onAskAboutPattern }: GraphPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [sidebarTab, setSidebarTab] = useState<"inspector" | "compliance" | "patterns">("inspector");
  const [gaps, setGaps] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [complianceSummary, setComplianceSummary] = useState<{
    equipment_count: number;
    regulation_count: number;
    sop_count: number;
    gap_count: number;
    fully_compliant: boolean;
  } | null>(null);
  const [failureSummary, setFailureSummary] = useState<{
    failure_count: number;
    component_count: number;
    symptom_count: number;
    equipment_count: number;
  } | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || 550,
      });
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 550,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadGraph = async (name: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/graph/entity/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (res.ok) {
        setGraphData(data);
      } else {
        setError(data.detail || "Failed to load graph data.");
      }
    } catch (err) {
      setError("Failed to connect to Neo4j graph endpoints.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraph("all");
  }, []);

  const loadGaps = async () => {
    setGapsLoading(true);
    try {
      const [gapsRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/compliance/gaps`),
        fetch(`${API_URL}/compliance/summary`),
      ]);
      if (gapsRes.ok) setGaps(await gapsRes.json());
      if (summaryRes.ok) setComplianceSummary(await summaryRes.json());
    } catch (e) { console.error("Gaps load failed", e); }
    finally { setGapsLoading(false); }
  };

  const loadPatterns = async () => {
    setPatternsLoading(true);
    try {
      const [patRes, failRes] = await Promise.all([
        fetch(`${API_URL}/intelligence/patterns`),
        fetch(`${API_URL}/graph/failure-summary`),
      ]);
      if (patRes.ok) setPatterns(await patRes.json());
      if (failRes.ok) setFailureSummary(await failRes.json());
    } catch (e) { console.error("Patterns load failed", e); }
    finally { setPatternsLoading(false); }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch(`${API_URL}/compliance/report`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReportMarkdown(data.report);
        setShowReport(true);  // open modal immediately
      }
    } catch (e) { console.error("Report gen failed", e); }
    finally { setGeneratingReport(false); }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadGraph("all");
    } else {
      loadGraph(searchQuery.trim());
    }
  };

  const getColorForLabel = (label: string) => {
    switch (label) {
      case "Equipment": return "#3b82f6";
      case "Failure":   return "#ef4444";
      case "Component": return "#f97316";
      case "Action":    return "#22c55e";
      case "Regulation": return "#a855f7";
      case "Symptom":   return "#14b8a6";
      case "Engineer":  return "#eab308";
      case "Document":  return "#64748b";
      case "Procedure": return "#ec4899";
      default:          return "#94a3b8";
    }
  };

  return (
    <>
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">
      {/* GRAPH CANVAS PANEL */}
      <div className="flex-1 flex flex-col relative bg-white" ref={containerRef}>
        {/* Search header */}
        <div className="absolute top-4 left-4 z-20 w-full max-w-sm">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search equipment (e.g. Boiler-12)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white text-slate-800 placeholder:text-slate-400 border border-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="bg-violet-600 hover:bg-violet-500 text-white text-xs px-3 py-2 rounded-lg font-medium cursor-pointer shadow-sm"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                loadGraph("all");
              }}
              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs px-3 py-2 rounded-lg font-medium cursor-pointer shadow-sm"
            >
              Reset
            </button>
          </form>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-20 bg-white border border-slate-200 p-3 rounded-lg text-[10px] font-mono grid grid-cols-2 sm:grid-cols-3 gap-2 shadow-md">
          {[
            { label: "Equipment", color: "#3b82f6" },
            { label: "Component", color: "#f97316" },
            { label: "Failure",   color: "#ef4444" },
            { label: "Action",    color: "#22c55e" },
            { label: "Regulation", color: "#a855f7" },
            { label: "Symptom",   color: "#14b8a6" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-slate-600">{label}</span>
            </div>
          ))}
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10 font-mono text-xs text-violet-600">
            Querying Neo4j databases...
          </div>
        )}

        {error && (
          <div className="absolute inset-x-0 top-16 mx-auto w-max bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-lg z-10 shadow">
            {error}
          </div>
        )}

        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            nodeColor={(node: any) => getColorForLabel(node.label)}
            nodeRelSize={7}
            nodeVal={1}
            linkLabel={(link: any) => link.type}
            linkWidth={1.5}
            linkColor={() => "rgba(100, 116, 139, 0.25)"}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            onNodeClick={(node: any) => setSelectedNode(node)}
            backgroundColor="#ffffff"
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.name;
              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px Sans-Serif`;
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

              ctx.beginPath();
              ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
              ctx.fillStyle = getColorForLabel(node.label);
              ctx.fill();

              if (globalScale > 0.8) {
                ctx.fillStyle = "rgba(248, 250, 252, 0.92)";
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - 12 - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#0f172a";
                ctx.fillText(label, node.x, node.y - 12);
              }
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            No graph nodes to show. Double-check your database connections.
          </div>
        )}
      </div>

      {/* PROPERTIES SIDEBAR PANEL */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-200 bg-white overflow-y-auto flex flex-col shadow-inner">
        {/* Sidebar tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {(["inspector", "compliance", "patterns"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setSidebarTab(tab);
                if (tab === "compliance" && gaps.length === 0) loadGaps();
                if (tab === "patterns" && patterns.length === 0) loadPatterns();
              }}
              className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-wide font-bold transition-colors cursor-pointer ${
                sidebarTab === tab
                  ? "text-violet-700 border-b-2 border-violet-600 bg-white"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {tab === "inspector" ? "Inspector" : tab === "compliance" ? "Compliance" : "Patterns"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 pb-2 border-b border-slate-200">
            <Info size={16} className="text-violet-500" />
            Entity Inspector
          </h3>

          {selectedNode ? (
            sidebarTab === "inspector" && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400">
                    Entity Type
                  </label>
                  <div
                    className="mt-1 text-xs px-2 py-1 rounded inline-block font-semibold text-white uppercase font-mono"
                    style={{ backgroundColor: getColorForLabel(selectedNode.label) }}
                  >
                    {selectedNode.label}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400">
                    Node Identifier
                  </label>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{selectedNode.name}</p>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-400">
                    Local Relationships
                  </label>
                  <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
                    {graphData.links
                      .filter((link: any) => {
                        const src = typeof link.source === "object" ? link.source.id : link.source;
                        const tgt = typeof link.target === "object" ? link.target.id : link.target;
                        return src === selectedNode.id || tgt === selectedNode.id;
                      })
                      .map((link: any, i) => {
                        const src = typeof link.source === "object" ? link.source.name : link.source;
                        const tgt = typeof link.target === "object" ? link.target.name : link.target;
                        const isSource = src === selectedNode.name;
                        return (
                          <div
                            key={i}
                            className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                          >
                            <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1">
                              <span>{isSource ? "Outgoing" : "Incoming"}</span>
                              <span className="text-violet-600 font-bold">{link.type}</span>
                            </div>
                            <p className="text-slate-700">
                              {isSource ? (
                                <>to <strong className="text-slate-900">{tgt}</strong></>
                              ) : (
                                <>from <strong className="text-slate-900">{src}</strong></>
                              )}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )
          ) : (
            sidebarTab === "inspector" && (
              <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 text-xs italic">
                <HelpCircle size={32} className="mb-2 text-slate-300" />
                Click on any node in the graph to inspect its parameters.
              </div>
            )
          )}

          {/* Compliance Tab */}
          {sidebarTab === "compliance" && (
            <div className="space-y-3">
              {gapsLoading ? (
                <p className="text-xs text-slate-500 font-mono text-center py-8">Analysing compliance matrix...</p>
              ) : (
                <ComplianceGapTable
                  gaps={gaps}
                  summary={complianceSummary}
                  onGenerateReport={handleGenerateReport}
                  generatingReport={generatingReport}
                />
              )}
              {/* Show report button if one is already loaded */}
              {reportMarkdown && !generatingReport && (
                <button
                  onClick={() => setShowReport(true)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-medium py-2 rounded-lg transition-all cursor-pointer"
                >
                  View Last Report
                </button>
              )}
            </div>
          )}

          {/* Patterns Tab */}
          {sidebarTab === "patterns" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-violet-500" />
                  Failure Patterns
                </p>
                <button
                  onClick={loadPatterns}
                  disabled={patternsLoading}
                  className="text-[10px] text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={10} className={patternsLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
              {patternsLoading ? (
                <p className="text-xs text-slate-500 font-mono text-center py-8">Running pattern engine...</p>
              ) : patterns.length === 0 ? (
                /* Fix 5: Failure Intelligence Summary when no patterns */
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    📊 Failure Intelligence Summary
                  </p>
                  {failureSummary ? (
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                        <p className="text-red-600 font-bold text-lg">{failureSummary.failure_count}</p>
                        <p className="text-slate-600">Failures recorded</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                        <p className="text-orange-600 font-bold text-lg">{failureSummary.component_count}</p>
                        <p className="text-slate-600">Components analysed</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                        <p className="text-amber-600 font-bold text-lg">{failureSummary.symptom_count}</p>
                        <p className="text-slate-600">Symptoms tracked</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                        <p className="text-blue-600 font-bold text-lg">{failureSummary.equipment_count}</p>
                        <p className="text-slate-600">Equipment items</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 font-mono">Loading failure data...</p>
                  )}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    No recurring failure patterns detected yet.
                    System is monitoring {failureSummary?.equipment_count ?? "—"} equipment items for emerging patterns.
                  </p>
                  <button
                    onClick={loadPatterns}
                    disabled={patternsLoading}
                    className="w-full flex items-center justify-center gap-2 bg-violet-50 hover:bg-violet-600 border border-violet-200 hover:border-violet-600 text-violet-700 hover:text-white text-xs font-medium py-2.5 rounded-lg transition-all cursor-pointer"
                  >
                    <RefreshCw size={12} className={patternsLoading ? "animate-spin" : ""} />
                    Analyse Patterns Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {patterns.map((p, i) => (
                    <PatternCard
                      key={i}
                      pattern={p}
                      onAskAI={(q) => onAskAboutPattern?.(q)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Compliance Report Modal — fixed overlay, rendered outside sidebar */}
      {showReport && reportMarkdown && (
        <ComplianceReportModal
          markdown={reportMarkdown}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
