import React from "react";
import { TrendingUp, Cpu, AlertTriangle, MessageSquare } from "lucide-react";

interface Pattern {
  pattern_name: string;
  affected_equipment: string[];
  root_cause: string;
  frequency: number;
  recommendation: string;
}

interface PatternCardProps {
  pattern: Pattern;
  onAskAI: (question: string) => void;
}

export default function PatternCard({ pattern, onAskAI }: PatternCardProps) {
  const freq = pattern.frequency || 0;
  const severity = freq >= 5 ? "HIGH" : freq >= 3 ? "MEDIUM" : "LOW";

  const borderColor =
    severity === "HIGH"
      ? "border-l-4 border-l-red-500 border-r border-t border-b border-red-200"
      : severity === "MEDIUM"
      ? "border-l-4 border-l-amber-500 border-r border-t border-b border-amber-200"
      : "border-l-4 border-l-slate-300 border-r border-t border-b border-slate-200";

  const badgeColor =
    severity === "HIGH"
      ? "bg-red-100 text-red-700 border-red-200"
      : severity === "MEDIUM"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-slate-100 text-slate-600 border-slate-200";

  const question = `What is the pattern of failures related to ${pattern.root_cause}? Provide detailed analysis and recommendations.`;

  return (
    <div className={`bg-white rounded-xl p-4 space-y-3 text-xs shadow-sm ${borderColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-slate-800 text-sm leading-tight flex-1">{pattern.pattern_name}</p>
        <span className={`shrink-0 px-2 py-0.5 rounded-full font-mono font-bold text-[10px] border uppercase ${badgeColor}`}>
          {severity}
        </span>
      </div>

      {/* Root cause + frequency */}
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-600">
          <TrendingUp size={11} className="text-violet-500" />
          <span>Root Cause: <strong className="text-slate-800">{pattern.root_cause}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AlertTriangle size={11} className="text-red-500" />
          <span>Frequency: <strong className="text-red-600">{freq}×</strong></span>
        </div>
      </div>

      {/* Affected equipment */}
      {pattern.affected_equipment.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pattern.affected_equipment.slice(0, 6).map((eq, i) => (
            <span key={i} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono text-[10px] border border-slate-200">
              {eq}
            </span>
          ))}
          {pattern.affected_equipment.length > 6 && (
            <span className="text-slate-500 text-[10px] self-center">+{pattern.affected_equipment.length - 6} more</span>
          )}
        </div>
      )}

      {/* Recommendation */}
      <div className="border-t border-slate-200 pt-2 flex items-start gap-1.5">
        <Cpu size={11} className="text-violet-500 mt-0.5 shrink-0" />
        <p className="text-violet-700 italic leading-relaxed">{pattern.recommendation}</p>
      </div>

      {/* Ask AI button */}
      <button
        onClick={() => onAskAI(question)}
        className="w-full flex items-center justify-center gap-1.5 bg-violet-50 hover:bg-violet-600 border border-violet-200 hover:border-violet-600 text-violet-700 hover:text-white text-[11px] font-medium py-2 rounded-lg transition-all cursor-pointer"
      >
        <MessageSquare size={12} />
        Ask AI about this pattern
      </button>
    </div>
  );
}
