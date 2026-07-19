import React from "react";
import { MessageSquare, Cpu } from "lucide-react";
import type { CitationInfo } from "./DocumentViewer";

interface SentenceHighlight {
  sentence: string;
  score: number;
  highlight_color: string;
}

interface MessageBubbleProps {
  sender: "user" | "system";
  text: string;
  highlights?: SentenceHighlight[];
  citations?: CitationInfo[];
  onCitationClick?: (citation: CitationInfo) => void;
}

export default function MessageBubble({
  sender,
  text,
  highlights,
  citations,
  onCitationClick,
}: MessageBubbleProps) {
  const isUser = sender === "user";

  const getHighlightClass = (color: string) => {
    switch (color) {
      case "green":
        return "highlight-green";
      case "yellow":
        return "highlight-yellow";
      case "red":
        return "highlight-red";
      default:
        return "";
    }
  };

  /**
   * Try to match each highlight sentence to a citation by rough text overlap,
   * so we can show a superscript citation number next to it.
   */
  const getCitationIndex = (sentence: string): number => {
    if (!citations || citations.length === 0) return -1;
    const sentenceLower = sentence.toLowerCase().trim();
    for (let i = 0; i < citations.length; i++) {
      const chunkLower = (citations[i].chunk_text || "").toLowerCase();
      // Check if sentence words overlap significantly with citation chunk
      const words = sentenceLower.split(/\s+/).filter((w) => w.length > 4);
      const matched = words.filter((w) => chunkLower.includes(w));
      if (words.length > 0 && matched.length / words.length > 0.4) return i;
    }
    return -1;
  };

  return (
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Icon Avatar — system */}
      {!isUser && (
        <div className="h-9 w-9 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-600 shrink-0">
          <Cpu size={18} />
        </div>
      )}

      {/* Bubble Box */}
      <div
        className={`max-w-2xl px-5 py-4 rounded-2xl text-sm leading-relaxed border ${
          isUser
            ? "bg-gradient-to-br from-violet-600 to-purple-700 text-white border-violet-700 rounded-tr-none shadow-md shadow-violet-100"
            : "bg-white text-slate-800 border-slate-200 rounded-tl-none shadow-sm"
        }`}
      >
        {!isUser && highlights && highlights.length > 0 ? (
          <div className="space-y-1.5">
            {highlights.map((highlight, index) => {
              const citIdx = getCitationIndex(highlight.sentence);
              const hasCit = citIdx >= 0 && citations && citations[citIdx];
              return (
                <span
                  key={index}
                  className={`inline mr-1 transition-all duration-300 ${getHighlightClass(
                    highlight.highlight_color
                  )}`}
                  title={`Grounding similarity: ${(highlight.score * 100).toFixed(0)}%`}
                >
                  {highlight.sentence}
                  {hasCit && (
                    <sup
                      className="ml-0.5 cursor-pointer text-violet-600 hover:text-violet-800 font-bold text-[10px] transition-colors"
                      title={`From: ${citations![citIdx].filename}, Page ${citations![citIdx].page_number}`}
                      onClick={() => onCitationClick?.(citations![citIdx])}
                    >
                      [{citIdx + 1}]
                    </sup>
                  )}
                  {" "}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="whitespace-pre-line">{text}</p>
        )}
      </div>

      {/* Icon Avatar — user */}
      {isUser && (
        <div className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
          <MessageSquare size={18} />
        </div>
      )}
    </div>
  );
}

export function cleanChunkText(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // 1. Remove company headers (e.g. Confidential, Internal Use Only, All Rights Reserved)
  cleaned = cleaned.replace(/confidential|internal use only|proprietary|all rights reserved/gi, "");

  // 2. Remove document IDs (e.g. Doc ID: 12345, Doc-1234, ID: ABC-123)
  cleaned = cleaned.replace(/doc(ument)?\s*(id|no|number)?\s*[:#-]?\s*[A-Z0-9_-]+/gi, "");
  cleaned = cleaned.replace(/\b(id|doc-id):\s*[a-z0-9_-]+/gi, "");

  // 3. Remove logo placeholders (e.g. [logo], [company logo], logo placeholder, [image])
  cleaned = cleaned.replace(/\[logo\]|logo placeholder|company logo|\[image\]|\[logo placeholder\]/gi, "");

  // 4. Remove revision numbers (e.g. Rev: 1.0, Revision: A, Rev. 2)
  cleaned = cleaned.replace(/rev(ision)?\s*(no|num|number)?\s*[:#-]?\s*[a-z0-9.]+/gi, "");

  // 5. Clean up whitespaces and redundant punctuation remnants
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^[:;,.-\s]+/, "").replace(/[:;,.-\s]+$/, "").trim();

  // If nothing meaningful remains (e.g. no alphabetic text or less than 5 characters of alphabet), return empty string
  const alphaChars = cleaned.replace(/[^a-zA-Z]/g, "");
  if (alphaChars.length < 5) {
    return "";
  }

  // 6. Max 120 characters
  if (cleaned.length > 120) {
    cleaned = cleaned.slice(0, 120).trim() + "…";
  }

  return cleaned;
}

