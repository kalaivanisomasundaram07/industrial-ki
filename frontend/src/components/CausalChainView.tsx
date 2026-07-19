import React from "react";
import { ArrowDown, Wrench, ShieldAlert, Cpu, Activity, Settings } from "lucide-react";

interface ChainLink {
  equipment: string;
  component: string;
  failure: string;
  symptom: string;
  action?: string;
}

interface CausalChainViewProps {
  chain: ChainLink[];
}

export default function CausalChainView({ chain }: CausalChainViewProps) {
  if (!chain || chain.length === 0) return null;

  // Take the first chain found for visualization
  const link = chain[0];

  const steps = [
    {
      label: "Equipment Context",
      value: link.equipment,
      color: "border-blue-500/40 text-blue-400 bg-blue-950/20",
      icon: <Settings size={16} />,
    },
    {
      label: "Affected Component",
      value: link.component,
      color: "border-orange-500/40 text-orange-400 bg-orange-950/20",
      icon: <Cpu size={16} />,
    },
    {
      label: "Failure Occurrence",
      value: link.failure,
      color: "border-red-500/40 text-red-400 bg-red-950/20",
      icon: <ShieldAlert size={16} />,
    },
    {
      label: "Exhibited Symptom",
      value: link.symptom,
      color: "border-teal-500/40 text-teal-400 bg-teal-950/20",
      icon: <Activity size={16} />,
    },
  ];

  if (link.action) {
    steps.push({
      label: "Resolution Action",
      value: link.action,
      color: "border-emerald-500/40 text-emerald-400 bg-emerald-950/20",
      icon: <Wrench size={16} />,
    });
  }

  return (
    <div className="flex flex-col items-center py-4 space-y-3 max-w-md mx-auto">
      {steps.map((step, idx) => (
        <React.Fragment key={idx}>
          {/* Card for each node in the chain */}
          <div className={`w-full border p-3 rounded-xl flex items-center justify-between gap-4 shadow-md ${step.color}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                {step.icon}
              </div>
              <div className="text-left">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                  {step.label}
                </span>
                <span className="text-sm font-bold text-white block mt-0.5">
                  {step.value}
                </span>
              </div>
            </div>
          </div>
          
          {/* Connecting arrow */}
          {idx < steps.length - 1 && (
            <div className="flex justify-center text-slate-600 py-1">
              <ArrowDown size={18} className="animate-bounce" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
