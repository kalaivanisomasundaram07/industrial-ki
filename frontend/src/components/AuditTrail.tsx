import React from "react";
import { Terminal, Clock } from "lucide-react";

interface AuditRecord {
  agent_name: string;
  action_taken: string;
  timestamp: string;
}

interface AuditTrailProps {
  trail: AuditRecord[];
}

export default function AuditTrail({ trail }: AuditTrailProps) {
  if (!trail || trail.length === 0) return null;

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="flex items-center gap-2 text-violet-700 font-bold border-b border-slate-200 pb-2 mb-2">
        <Terminal size={14} />
        <span>Agent System Audit Trail</span>
      </div>

      <div className="relative pl-6 border-l-2 border-slate-200 space-y-5">
        {trail.map((record, index) => {
          let timeStr = "";
          try {
            const dt = new Date(record.timestamp);
            timeStr = dt.toTimeString().split(" ")[0];
          } catch {
            timeStr = record.timestamp;
          }

          return (
            <div key={index} className="relative group">
              {/* Timeline Indicator Dot */}
              <span className="absolute -left-[30px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-violet-400">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 group-hover:scale-150 transition-transform" />
              </span>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg hover:border-violet-300 transition-colors">
                <div className="flex items-center justify-between text-[10px] text-slate-600 font-bold mb-1">
                  <span className="text-violet-700">{record.agent_name}</span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock size={10} />
                    {timeStr}
                  </span>
                </div>
                {/* Fix 2: was text-slate-350 (invisible) → text-slate-700 */}
                <p className="text-slate-700 leading-relaxed font-sans mt-1">
                  {record.action_taken}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
