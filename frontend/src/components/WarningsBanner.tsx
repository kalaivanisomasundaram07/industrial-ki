import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, X, Cpu } from "lucide-react";

interface Warning {
  warning_title: string;
  affected_equipment: string[];
  pattern_description: string;
  recommendation: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

interface WarningsBannerProps {
  warnings: Warning[];
  onDismiss: (idx: number) => void;
}

export default function WarningsBanner({ warnings, onDismiss }: WarningsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!warnings || warnings.length === 0) return null;

  const criticalCount = warnings.filter((w) => w.severity === "CRITICAL").length;
  const highCount = warnings.filter((w) => w.severity === "HIGH").length;

  return (
    <div className="w-full border-b border-amber-200 bg-amber-50">
      {/* Collapse/expand header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-3 text-left hover:bg-amber-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={16} className="text-amber-600 animate-pulse" />
            <span className="font-bold text-amber-800 text-sm">
              {warnings.length} Active Warning{warnings.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px]">
            {criticalCount > 0 && (
              <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                {criticalCount} CRITICAL
              </span>
            )}
            {highCount > 0 && (
              <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                {highCount} HIGH
              </span>
            )}
          </div>
          <span className="text-xs text-amber-700 hidden sm:inline">— Click to {expanded ? "collapse" : "view"}</span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-amber-700 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-amber-700 shrink-0" />
        )}
      </button>

      {/* Warning cards panel */}
      {expanded && (
        <div className="px-4 sm:px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {warnings.map((w, idx) => (
            <div
              key={idx}
              className={`relative bg-white border rounded-xl p-4 text-xs space-y-2 shadow-sm ${
                w.severity === "CRITICAL"
                  ? "border-l-4 border-red-500 border-r border-t border-b border-red-200"
                  : w.severity === "HIGH"
                  ? "border-l-4 border-amber-500 border-r border-t border-b border-amber-200"
                  : "border-l-4 border-yellow-400 border-r border-t border-b border-yellow-200"
              }`}
            >
              {/* Dismiss button */}
              <button
                onClick={() => onDismiss(idx)}
                className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>

              {/* Severity badge */}
              <span
                className={`inline-block px-2 py-0.5 rounded-full font-mono font-bold uppercase text-[10px] ${
                  w.severity === "CRITICAL"
                    ? "bg-red-100 text-red-700 border border-red-200"
                    : w.severity === "HIGH"
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-yellow-100 text-yellow-800 border border-yellow-200"
                }`}
              >
                {w.severity}
              </span>

              <p className="font-semibold text-slate-800 text-sm pr-4">{w.warning_title}</p>
              <p className="text-slate-600 leading-relaxed">{w.pattern_description}</p>

              {w.affected_equipment.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {w.affected_equipment.slice(0, 5).map((eq, i) => (
                    <span key={i} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono text-[10px] border border-slate-200">
                      {eq}
                    </span>
                  ))}
                  {w.affected_equipment.length > 5 && (
                    <span className="text-slate-400 text-[10px]">+{w.affected_equipment.length - 5} more</span>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 pt-2 flex items-start gap-1.5">
                <Cpu size={11} className="text-violet-500 mt-0.5 shrink-0" />
                <p className="text-violet-700 italic">{w.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
