import React from "react";
import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";

interface GroundingBadgeProps {
  score: number;
}

export default function GroundingBadge({ score }: GroundingBadgeProps) {
  const percentage = Math.round(score * 100);

  let colorClasses = "";
  let icon = null;

  if (score >= 0.70) {
    colorClasses = "bg-green-50 text-green-700 border-green-200";
    icon = <ShieldCheck size={14} className="text-green-600" />;
  } else if (score >= 0.45) {
    colorClasses = "bg-amber-50 text-amber-700 border-amber-200";
    icon = <Shield size={14} className="text-amber-600" />;
  } else {
    colorClasses = "bg-red-50 text-red-700 border-red-200";
    icon = <ShieldAlert size={14} className="text-red-600" />;
  }

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border uppercase tracking-wider shadow-sm ${colorClasses}`}>
      {icon}
      <span>{percentage}% Grounded</span>
    </div>
  );
}
