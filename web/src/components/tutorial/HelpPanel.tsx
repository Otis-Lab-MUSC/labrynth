import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, ChevronRight, Search, BookOpen } from "lucide-react";
import { useTutorialStore } from "../../store/useTutorialStore";
import { HELP_CONTENT } from "./help/content";
import type { HelpSection } from "./help/content";

function SectionItem({
  section,
  depth,
  expandedIds,
  toggleExpanded,
  targetRef,
  targetId,
}: {
  section: HelpSection;
  depth: number;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  targetRef: React.RefObject<HTMLDivElement | null>;
  targetId: string | null;
}) {
  const isExpanded = expandedIds.has(section.id);
  const hasSubs = section.subsections && section.subsections.length > 0;
  const isTarget = section.id === targetId;

  return (
    <div ref={isTarget ? targetRef : undefined}>
      <button
        onClick={() => toggleExpanded(section.id)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent/5 ${
          depth > 0 ? "pl-6" : ""
        }`}
      >
        {hasSubs ? (
          isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-accent" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-theme-text/40" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className={`font-medium ${depth === 0 ? "text-accent" : "text-theme-text"}`}>
          {section.title}
        </span>
      </button>

      {isExpanded && (
        <div className={`px-4 pb-3 ${depth > 0 ? "pl-10" : "pl-8"}`}>
          {section.content.split("\n\n").map((paragraph, i) => (
            <p key={i} className="text-sm text-theme-text/70 leading-relaxed mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {isExpanded &&
        hasSubs &&
        section.subsections!.map((sub) => (
          <SectionItem
            key={sub.id}
            section={sub}
            depth={depth + 1}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            targetRef={targetRef}
            targetId={targetId}
          />
        ))}
    </div>
  );
}

function flattenSections(sections: HelpSection[]): HelpSection[] {
  const result: HelpSection[] = [];
  for (const s of sections) {
    result.push(s);
    if (s.subsections) result.push(...flattenSections(s.subsections));
  }
  return result;
}

function getAncestorIds(targetId: string, sections: HelpSection[]): string[] {
  const ids: string[] = [];
  function search(items: HelpSection[], path: string[]): boolean {
    for (const s of items) {
      if (s.id === targetId) {
        ids.push(...path, s.id);
        return true;
      }
      if (s.subsections && search(s.subsections, [...path, s.id])) return true;
    }
    return false;
  }
  search(sections, []);
  return ids;
}

export function HelpPanel() {
  const helpOpen = useTutorialStore((s) => s.helpOpen);
  const helpSection = useTutorialStore((s) => s.helpSection);
  const setHelpOpen = useTutorialStore((s) => s.setHelpOpen);
  const startTour = useTutorialStore((s) => s.startTour);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const targetRef = useRef<HTMLDivElement | null>(null);

  // Deep-link: expand ancestors and scroll to target section
  useEffect(() => {
    if (helpSection && helpOpen) {
      const ancestors = getAncestorIds(helpSection, HELP_CONTENT);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of ancestors) next.add(id);
        return next;
      });
      // Scroll after expansion renders
      requestAnimationFrame(() => {
        targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [helpSection, helpOpen]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter sections by search query
  const allFlat = flattenSections(HELP_CONTENT);
  const matchingIds = searchQuery.trim()
    ? new Set(
        allFlat
          .filter(
            (s) =>
              s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.content.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map((s) => s.id)
      )
    : null;

  // When searching, auto-expand matching sections and their ancestors
  useEffect(() => {
    if (matchingIds) {
      const toExpand = new Set<string>();
      for (const id of matchingIds) {
        const ancestors = getAncestorIds(id, HELP_CONTENT);
        for (const a of ancestors) toExpand.add(a);
      }
      setExpandedIds(toExpand);
    }
  }, [searchQuery]);

  const filteredContent = matchingIds
    ? HELP_CONTENT.filter((s) => {
        const flat = flattenSections([s]);
        return flat.some((f) => matchingIds.has(f.id));
      })
    : HELP_CONTENT;

  if (!helpOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/20"
        onClick={() => setHelpOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-[81] h-full w-80 bg-panel border-l border-theme-border shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-theme-border px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-theme-text">Help</h2>
          </div>
          <button
            onClick={() => setHelpOpen(false)}
            className="rounded p-1 hover:bg-accent/10 text-theme-text/50 hover:text-theme-text transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-theme-border">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text/30" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help..."
              className="w-full pl-8 pr-3 py-1.5 text-sm input-base"
            />
          </div>
        </div>

        {/* Tour button */}
        <div className="px-3 py-2 border-b border-theme-border">
          <button
            onClick={() => {
              setHelpOpen(false);
              startTour("first-session");
            }}
            className="w-full rounded px-3 py-1.5 text-xs text-accent border border-accent/30 hover:bg-accent/10 transition"
          >
            Take the Guided Tour
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredContent.length === 0 ? (
            <p className="px-4 py-8 text-sm text-theme-text/40 text-center">
              No results for "{searchQuery}"
            </p>
          ) : (
            filteredContent.map((section) => (
              <SectionItem
                key={section.id}
                section={section}
                depth={0}
                expandedIds={expandedIds}
                toggleExpanded={toggleExpanded}
                targetRef={targetRef}
                targetId={helpSection}
              />
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
