import React, { useState } from "react";
import { Download, ShieldCheck, ShieldAlert, AlertTriangle, ChevronRight } from "lucide-react";
import { API_URL } from "../config";

interface Gap {
  equipment: string;
  regulation: string;
  gap_type: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

interface ComplianceSummary {
  equipment_count: number;
  regulation_count: number;
  sop_count: number;
  gap_count: number;
  fully_compliant: boolean;
}

interface ComplianceGapTableProps {
  gaps: Gap[];
  summary: ComplianceSummary | null;
  onGenerateReport: () => void;
  generatingReport: boolean;
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
  HIGH:     "bg-orange-100 text-orange-700 border-orange-200",
  MEDIUM:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW:      "bg-slate-100 text-slate-600 border-slate-200",
};

const GAP_TYPE_LABELS: Record<string, string> = {
  MISSING_PROCEDURE:  "Missing SOP",
  UNRESOLVED_FAILURE: "Unresolved Failure",
};

export default function ComplianceGapTable({
  gaps, summary, onGenerateReport, generatingReport,
}: ComplianceGapTableProps) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownloadEvidence = async (equipment: string) => {
    setDownloading(equipment);
    try {
      const res = await fetch(
        `${API_URL}/compliance/evidence/${encodeURIComponent(equipment)}`
      );
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evidence_${equipment.replace(/\s+/g, "_")}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Evidence download failed:", err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-500" />
            Compliance Gap Analysis
          </h3>
          <button
            onClick={onGenerateReport}
            disabled={generatingReport}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
          >
            <AlertTriangle size={11} />
            {generatingReport ? "Generating..." : "Full Report"}
          </button>
        </div>

        {/* Summary when no gaps */}
        {gaps.length === 0 && summary && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
              <ShieldCheck size={16} className="text-green-600" />
              Knowledge Graph Compliance Status
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-white rounded-lg border border-green-200 p-2.5">
                <p className="text-green-600 font-bold text-lg">{summary.equipment_count}</p>
                <p className="text-slate-600">Equipment monitored</p>
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-2.5">
                <p className="text-green-600 font-bold text-lg">{summary.regulation_count}</p>
                <p className="text-slate-600">Regulations mapped</p>
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-2.5">
                <p className="text-green-600 font-bold text-lg">{summary.sop_count}</p>
                <p className="text-slate-600">SOPs linked</p>
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-2.5">
                <p className="text-green-600 font-bold text-lg">0</p>
                <p className="text-slate-600">Compliance gaps</p>
              </div>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">
              No compliance gaps detected. All monitored equipment has linked procedures and regulations.
            </p>
          </div>
        )}

        {/* No gaps + no summary loaded yet */}
        {gaps.length === 0 && !summary && (
          <div className="h-24 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-500 text-xs italic bg-white">
            No compliance gaps detected.
          </div>
        )}
      </div>

      {/* Gap table when gaps exist */}
      {gaps.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 font-mono text-[10px] text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3">Regulation</th>
                <th className="px-4 py-3">Gap Type</th>
                <th className="px-4 py-3 text-center">Severity</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gaps.map((gap, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{gap.equipment}</td>
                  <td className="px-4 py-3 font-mono text-violet-700 whitespace-nowrap">{gap.regulation}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono text-[10px] border border-slate-200">
                      {GAP_TYPE_LABELS[gap.gap_type] || gap.gap_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] border uppercase ${SEVERITY_STYLES[gap.severity] || SEVERITY_STYLES.LOW}`}>
                      {gap.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDownloadEvidence(gap.equipment)}
                      disabled={downloading === gap.equipment}
                      className="flex items-center gap-1.5 ml-auto bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Download size={11} />
                      {downloading === gap.equipment ? "..." : "Evidence"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
