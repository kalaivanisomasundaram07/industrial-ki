import React from "react";
import { Zap } from "lucide-react";

interface PerformanceBarProps {
  queryTimeMs: number;
  graphMs: number;
  vectorMs: number;
  llmMs: number;
  verifyMs: number;
}

function Segment({
  label,
  ms,
  color,
  total,
}: {
  label: string;
  ms: number;
  color: string;
  total: number;
}) {
  const pct = total > 0 ? Math.max((ms / total) * 100, 2) : 0;
  return (
    <div className="flex-1 min-w-0" title={`${label}: ${ms.toFixed(0)}ms`}>
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%`, minWidth: "4px" }} />
    </div>
  );
}

export default function PerformanceBar({
  queryTimeMs,
  graphMs,
  vectorMs,
  llmMs,
  verifyMs,
}: PerformanceBarProps) {
  if (!queryTimeMs || queryTimeMs === 0) return null;

  const total = graphMs + vectorMs + llmMs + verifyMs || queryTimeMs;

  return (
    <div className="flex flex-col gap-1.5 bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[10px] font-mono shadow-sm">
      {/* Summary line */}
      <div className="flex flex-wrap items-center gap-2 text-slate-500">
        <div className="flex items-center gap-1 text-violet-700 font-bold">
          <Zap size={11} />
          <span>Answer in {(queryTimeMs / 1000).toFixed(2)}s</span>
        </div>
        <span className="text-slate-300">|</span>
        {graphMs > 0 && <span>Graph: <strong className="text-blue-600">{graphMs.toFixed(0)}ms</strong></span>}
        {vectorMs > 0 && <span>Vector: <strong className="text-teal-600">{vectorMs.toFixed(0)}ms</strong></span>}
        {llmMs > 0 && <span>LLM: <strong className="text-purple-600">{llmMs.toFixed(0)}ms</strong></span>}
        {verifyMs > 0 && <span>Verify: <strong className="text-green-600">{verifyMs.toFixed(0)}ms</strong></span>}
      </div>

      {/* Visual breakdown bar */}
      <div className="flex gap-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        {graphMs > 0 && <Segment label="Graph" ms={graphMs} color="bg-blue-500" total={total} />}
        {vectorMs > 0 && <Segment label="Vector" ms={vectorMs} color="bg-teal-500" total={total} />}
        {llmMs > 0 && <Segment label="LLM" ms={llmMs} color="bg-purple-500" total={total} />}
        {verifyMs > 0 && <Segment label="Verify" ms={verifyMs} color="bg-green-500" total={total} />}
      </div>
    </div>
  );
}
