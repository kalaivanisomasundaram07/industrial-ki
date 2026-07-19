import React from "react";
import { AlertOctagon } from "lucide-react";

interface Conflict {
  claim: string;
  source_a: string;
  source_b: string;
}

interface ConflictBannerProps {
  conflicts: Conflict[];
}

export default function ConflictBanner({ conflicts }: ConflictBannerProps) {
  if (!conflicts || conflicts.length === 0) return null;

  return (
    <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 text-xs font-sans space-y-3 shadow-sm">
      <div className="flex items-center gap-2 text-red-700 font-bold uppercase tracking-wider font-mono">
        <AlertOctagon size={16} />
        <span>Factual Conflict Detected</span>
      </div>

      <p className="text-red-800 leading-relaxed">
        The generated response draft contains claims that contradict relations recorded in the verified Knowledge Graph database. Review the discrepancies below:
      </p>

      <div className="space-y-3">
        {conflicts.map((conf, index) => (
          <div key={index} className="bg-white border border-red-200 p-3 rounded-lg space-y-2 shadow-sm">
            <div className="font-semibold text-red-700 font-mono text-[11px]">
              Contradiction: {conf.claim}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono leading-relaxed">
              <div className="p-2 bg-red-50 border border-red-100 rounded">
                <span className="text-red-600 font-bold block mb-0.5">Source Draft:</span>
                <span className="text-red-800">{conf.source_a}</span>
              </div>
              <div className="p-2 bg-green-50 border border-green-200 rounded">
                <span className="text-green-700 font-bold block mb-0.5">Knowledge Graph:</span>
                <span className="text-green-800">{conf.source_b}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
