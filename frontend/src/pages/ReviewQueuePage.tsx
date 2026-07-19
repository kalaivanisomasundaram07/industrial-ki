import React, { useState, useEffect } from "react";
import { Check, X, FileText, Award } from "lucide-react";
import { API_URL } from "../config";

interface Triple {
  entity1: { type: string; name: string };
  relation: string;
  entity2: { type: string; name: string };
}

interface ReviewItem {
  id: string;
  triple: Triple;
  evidence: string;
  doc_id: string;
  filename: string;
  score: number;
  status: string;
}

interface ReviewQueuePageProps {
  onQueueUpdated: () => void;
}

export default function ReviewQueuePage({ onQueueUpdated }: ReviewQueuePageProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/review-queue`);
      const data = await res.json();
      if (res.ok) {
        setItems(data);
      }
    } catch (err) {
      console.error("Failed to load review queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/review-queue/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setMessage("Item successfully approved and committed to Neo4j.");
        loadQueue();
        onQueueUpdated();
      } else {
        const err = await res.json();
        setMessage(`Approval failed: ${err.detail}`);
      }
    } catch (err) {
      setMessage("Failed to connect to the server.");
    } finally {
      setTimeout(() => setMessage(""), 5000);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/review-queue/${id}/reject`, {
        method: "POST",
      });
      if (res.ok) {
        setMessage("Item successfully rejected.");
        loadQueue();
        onQueueUpdated();
      } else {
        const err = await res.json();
        setMessage(`Rejection failed: ${err.detail}`);
      }
    } catch (err) {
      setMessage("Failed to connect to the server.");
    } finally {
      setTimeout(() => setMessage(""), 5000);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full bg-slate-50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Ingestion Review Queue</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Triples with confidence scores between 0.50 and 0.74 require human verification before committing to Neo4j.
          </p>
        </div>
        {items.length > 0 && (
          <span className="bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-full text-xs font-mono">
            {items.length} Pending Actions
          </span>
        )}
      </div>

      {message && (
        <div className="mb-4 bg-violet-50 border border-violet-200 text-violet-700 px-4 py-3 rounded-lg text-xs font-mono">
          {message}
        </div>
      )}

      {loading ? (
        <div className="h-64 flex items-center justify-center font-mono text-xs text-slate-400">
          Loading queued entries...
        </div>
      ) : items.length === 0 ? (
        <div className="h-64 border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-white shadow-sm">
          <Award size={36} className="text-green-500 mb-2" />
          <h4 className="text-sm font-bold text-slate-700">Queue is Clear</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            All extracted facts have been auto-committed or reviewed. Upload more documents to start parsing.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-left">
            <thead className="bg-slate-50 font-mono text-[10px] text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Proposed Relationship (Triple)</th>
                <th className="px-6 py-4">Evidence Snippet</th>
                <th className="px-6 py-4">Source Document</th>
                <th className="px-6 py-4 text-center">Confidence</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {items.map((item, rowIdx) => {
                const { entity1, relation, entity2 } = item.triple;
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-slate-50 ${rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                  >
                    {/* Triple Representation */}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="bg-blue-50 px-2 py-0.5 rounded text-[10px] font-mono text-blue-700 border border-blue-200">
                          {entity1.type}: {entity1.name}
                        </span>
                        <span className="text-violet-600 font-mono font-bold text-[10px] uppercase">
                          -{relation}-&gt;
                        </span>
                        <span className="bg-green-50 px-2 py-0.5 rounded text-[10px] font-mono text-green-700 border border-green-200">
                          {entity2.type}: {entity2.name}
                        </span>
                      </div>
                    </td>

                    {/* Evidence Snippet */}
                    <td className="px-6 py-4 max-w-xs truncate text-slate-600 italic">
                      "{item.evidence || "No sentence context recorded."}"
                    </td>

                    {/* Source File */}
                    <td className="px-6 py-4 font-mono text-[11px] text-violet-700">
                      <span className="flex items-center gap-1">
                        <FileText size={12} />
                        {item.filename}
                      </span>
                    </td>

                    {/* Confidence Score */}
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-mono font-bold text-[10px]">
                        {(item.score * 100).toFixed(0)}%
                      </span>
                    </td>

                    {/* Action buttons */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="p-1.5 bg-green-50 hover:bg-green-600 border border-green-300 text-green-600 hover:text-white rounded-lg transition-all cursor-pointer"
                          title="Approve & Commit"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-600 border border-red-300 text-red-600 hover:text-white rounded-lg transition-all cursor-pointer"
                          title="Reject & Discard"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
