import { type DragEvent, useState, useMemo, useEffect } from "react";
import { fetchTemplates, getCachedTemplates, clearTemplateCache } from "../templateApi";
import type { DeviceTemplate } from "../types";
import { useSchematicStore } from "../store";
import { scoreTemplate } from "../templateSearch";
import { useLibraryRegistryStore } from "../libraryRegistry";
import deviceCategories from "../deviceCategories.json";

const APP_VERSION = __APP_VERSION__;
const BUILD_HASH = __BUILD_HASH__;

const FALLBACK_CATEGORIES: { label: string; types: string[] }[] = deviceCategories;

function onDragStart(event: DragEvent, template: DeviceTemplate) {
  event.dataTransfer.setData(
    "application/easyschematic-device",
    JSON.stringify(template),
  );
  event.dataTransfer.effectAllowed = "move";
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-blue-600 font-semibold">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

function TemplateItem({
  template,
  query,
  hasPreset,
  isFavorite,
  onToggleFavorite,
}: {
  template: DeviceTemplate;
  query: string;
  hasPreset?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded cursor-grab hover:bg-[var(--color-surface-hover)] transition-colors group"
      draggable
      onDragStart={(e) => onDragStart(e, template)}
    >
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`shrink-0 text-xs cursor-pointer transition-colors ${
            isFavorite
              ? "text-amber-400"
              : "text-[var(--color-text-muted)]/30 opacity-0 group-hover:opacity-100"
          }`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-xs text-[var(--color-text-heading)] font-medium truncate flex items-center gap-1">
          <HighlightedText text={template.label} query={query} />
          {hasPreset && (
            <span className="text-[8px] text-blue-500 bg-blue-50 rounded px-1 py-px font-normal shrink-0">preset</span>
          )}
        </span>
        {template.manufacturer && (
          <span className="text-[9px] text-[var(--color-text-muted)] opacity-100 truncate">
            <HighlightedText text={template.manufacturer} query={query} />
          </span>
        )}
      </div>
    </div>
  );
}

/** One category or subcategory: label, direct templates, optional nested children. */
type CategoryTreeSection = {
  label: string;
  templates: DeviceTemplate[];
  children: CategoryTreeSection[];
};

function countSection(s: CategoryTreeSection): number {
  return s.templates.length + s.children.reduce((sum, c) => sum + countSection(c), 0);
}

function CategorySection({
  section,
  depth,
  query,
  defaultOpen,
  presetIds,
  favoriteSet,
  onToggleFavorite,
  userDeviceTypeSet,
}: {
  section: CategoryTreeSection;
  depth: number;
  query: string;
  defaultOpen: boolean;
  presetIds?: Set<string>;
  favoriteSet?: Set<string>;
  onToggleFavorite?: (key: string) => void;
  userDeviceTypeSet?: Set<string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = query ? true : open;
  const { label, templates, children } = section;
  const totalCount = countSection(section);
  const hasContent = templates.length > 0 || children.length > 0;

  if (!hasContent) return null;

  const isSub = depth > 0;
  return (
    <div className={isSub ? "ml-2 border-l border-[var(--color-border)] pl-1.5" : ""}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-full px-1 mb-0.5 cursor-pointer group/cat"
      >
        <span
          className={`text-[9px] text-[var(--color-text-muted)] transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className={`text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] group-hover/cat:text-[var(--color-text)] transition-colors truncate ${isSub ? "text-[9px] normal-case" : ""}`}>
          {label}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] ml-auto opacity-60 shrink-0">
          {totalCount}
        </span>
      </button>
      {isOpen && (
        <div className="space-y-0.5">
          {children.map((child) => (
            <CategorySection
              key={child.label}
              section={child}
              depth={depth + 1}
              query={query}
              defaultOpen={false}
              presetIds={presetIds}
              favoriteSet={favoriteSet}
              onToggleFavorite={onToggleFavorite}
              userDeviceTypeSet={userDeviceTypeSet}
            />
          ))}
          {templates.map((template) => {
            const key = template.id ?? template.deviceType;
            return (
              <TemplateItem
                key={key}
                template={template}
                query={query}
                hasPreset={!!(template.id && presetIds?.has(template.id))}
                isFavorite={favoriteSet?.has(key)}
                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(key) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DeviceLibrary() {
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const templatePresets = useSchematicStore((s) => s.templatePresets);
  const favoriteTemplates = useSchematicStore((s) => s.favoriteTemplates);
  const toggleFavoriteTemplate = useSchematicStore((s) => s.toggleFavoriteTemplate);
  const syncDevicesToTemplates = useSchematicStore((s) => s.syncDevicesToTemplates);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [templates, setTemplates] = useState(getCachedTemplates);
  const registryCategories = useLibraryRegistryStore((s) => s.categories);
  const useCategoryTree = registryCategories.length > 0;
  const categoriesToUse = useCategoryTree
    ? null
    : FALLBACK_CATEGORIES;

  const presetIds = useMemo(() => new Set(Object.keys(templatePresets)), [templatePresets]);
  const favoriteSet = useMemo(() => new Set(favoriteTemplates), [favoriteTemplates]);
  const userDeviceTypeSet = useMemo(() => new Set(customTemplates.map((t) => t.deviceType)), [customTemplates]);

  useEffect(() => {
    fetchTemplates()
      .then((t) => {
        setTemplates(t);
        syncDevicesToTemplates(t);
      });
  }, [syncDevicesToTemplates]);

  useEffect(() => {
    const refresh = () => {
      clearTemplateCache();
      fetchTemplates()
        .then((t) => {
          setTemplates(t);
          syncDevicesToTemplates(t);
        });
    };

    window.addEventListener("easyschematic:templates:refresh", refresh);
    return () => window.removeEventListener("easyschematic:templates:refresh", refresh);
  }, [syncDevicesToTemplates]);

  const query = search.trim();

  // When searching, produce a flat ranked list; when browsing, keep categories
  const rankedResults = useMemo(() => {
    if (!query) return null;
    const all = [...templates, ...customTemplates];
    const scored = all
      .map((t) => {
        let score = scoreTemplate(t, query);
        // Boost favorites to the top of results
        if (score > 0 && favoriteSet.has(t.id ?? t.deviceType)) score += 200;
        return { template: t, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.template.label.localeCompare(b.template.label));
    return scored.map((r) => r.template);
  }, [templates, customTemplates, query, favoriteSet]);

  // Favorites section: resolve template keys to actual template objects
  const favoritesList = useMemo(() => {
    if (favoriteTemplates.length === 0) return [];
    const all = [...templates, ...customTemplates];
    const byKey = new Map<string, DeviceTemplate>();
    for (const t of all) byKey.set(t.id ?? t.deviceType, t);
    return favoriteTemplates.map((k) => byKey.get(k)).filter((t): t is DeviceTemplate => !!t);
  }, [templates, customTemplates, favoriteTemplates]);

  const filteredCategories = useMemo((): CategoryTreeSection[] => {
    const all = [...templates, ...customTemplates];

    if (useCategoryTree && registryCategories.length > 0) {
      function buildTree(parentId: string | null): CategoryTreeSection[] {
        const nodes = registryCategories
          .filter((c) => (c.parentId ?? null) === parentId)
          .toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label));
        return nodes.map((c) => ({
          label: c.label,
          templates: all
            .filter((t) => (t.categoryId ?? null) === c.id)
            .toSorted((a, b) => a.label.localeCompare(b.label)),
          children: buildTree(c.id),
        }));
      }
      const roots = buildTree(null);
      const uncategorized = all.filter((t) => t.categoryId == null || t.categoryId === "");
      const sortedOther = uncategorized.toSorted((a, b) => a.label.localeCompare(b.label));
      return sortedOther.length > 0
        ? [...roots, { label: "Uncategorized", templates: sortedOther, children: [] }]
        : roots;
    }

    const categorized = (categoriesToUse ?? []).flatMap((cat) => cat.types);
    const categorizedSet = new Set(categorized);
    const cats = (categoriesToUse ?? []).map((cat) => {
      const inCat = all.filter((t) => cat.types.includes(t.deviceType));
      const sorted = inCat.toSorted((a, b) => a.label.localeCompare(b.label));
      return { label: cat.label, templates: sorted, children: [] as CategoryTreeSection[] };
    });
    const uncategorized = all.filter((t) => !categorizedSet.has(t.deviceType));
    const sortedOther = uncategorized.toSorted((a, b) => a.label.localeCompare(b.label));
    return sortedOther.length > 0 ? [...cats, { label: "Other", templates: sortedOther, children: [] }] : cats;
  }, [templates, customTemplates, useCategoryTree, registryCategories, categoriesToUse]);

  const totalResults = rankedResults?.length ?? filteredCategories.reduce((sum, c) => sum + countSection(c), 0);

  if (collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col items-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="Show device library"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        <div className="writing-mode-vertical text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          Devices
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          Devices
        </h2>
        <button
          onClick={() => setCollapsed(true)}
          className="cursor-pointer hover:bg-[var(--color-surface-hover)] rounded p-0.5 transition-colors"
          title="Collapse device library"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-[var(--color-border)]">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices..."
            className="w-full bg-white border border-[var(--color-border)] rounded pl-7 pr-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm cursor-pointer"
            >
              &times;
            </button>
          )}
        </div>
        {query && (
          <div className="text-[10px] text-[var(--color-text-muted)] mt-1 px-0.5">
            {totalResults} result{totalResults !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Note draggable */}
        {(!query || "note".includes(query.toLowerCase())) && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/easyschematic-note", "1");
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-amber-300/60 bg-amber-50 hover:bg-amber-100/60 cursor-grab active:cursor-grabbing transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M3 2h7l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
              <path d="M10 2v4h4" />
              <line x1="5" y1="8" x2="11" y2="8" />
              <line x1="5" y1="11" x2="9" y2="11" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Note</span>
          </div>
        )}

        {/* Room draggable */}
        {(!query || "room".includes(query.toLowerCase())) && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/easyschematic-room",
                JSON.stringify({ label: "Room" }),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-hover)] cursor-grab active:cursor-grabbing transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" strokeDasharray="3 2" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Room</span>
          </div>
        )}

        {query && rankedResults ? (
          <>
            {rankedResults.length > 0 ? (
              <div>
                {rankedResults.map((template) => {
                  const key = template.id ?? template.deviceType;
                  return (
                    <TemplateItem
                      key={key}
                      template={template}
                      query={query}
                      hasPreset={!!(template.id && presetIds.has(template.id))}
                      isFavorite={favoriteSet.has(key)}
                      onToggleFavorite={() => toggleFavoriteTemplate(key)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
                No devices match &ldquo;{query}&rdquo;
              </div>
            )}
          </>
        ) : (
          <>
            {favoritesList.length > 0 && (
              <CategorySection
                section={{ label: "Favorites", templates: favoritesList, children: [] }}
                depth={0}
                query={query}
                defaultOpen={true}
                presetIds={presetIds}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
                userDeviceTypeSet={userDeviceTypeSet}
              />
            )}

            {filteredCategories.map((cat) => (
              <CategorySection
                key={cat.label}
                section={cat}
                depth={0}
                query={query}
                defaultOpen={false}
                presetIds={presetIds}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
                userDeviceTypeSet={userDeviceTypeSet}
              />
            ))}
          </>
        )}
      </div>

      {/* Version */}
      <div className="px-3 py-1.5 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]">
        v{APP_VERSION} ({BUILD_HASH})
      </div>
    </div>
  );
}
