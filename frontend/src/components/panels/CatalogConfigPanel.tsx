'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Database, Save, ShieldCheck, GitMerge, Plus, Trash2, Pencil,
  Layers, HardDrive, Lock, Globe, Image as ImageIcon,
} from 'lucide-react';
import type {
  PipelineStepDefinition, CatalogConfig, CatalogAuthMode, CatalogDuplicatePolicy,
  CatalogInitialStatus, CatalogQualityFailurePolicy, CollectionMappingRule, ProductLevel,
} from '@/types/pipeline';
import {
  CATALOG_AUTH_MODE_LABELS,
  CATALOG_DUPLICATE_POLICY_LABELS,
  CATALOG_INITIAL_STATUS_LABELS,
  CATALOG_QUALITY_FAILURE_POLICY_LABELS,
  SAR_PRODUCTS_INGEST_MAPPING,
  STAC_STANDARD_MAPPING,
} from '@/types/pipeline';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { cn } from '@/lib/utils';

interface CatalogConfigPanelProps {
  step: PipelineStepDefinition;
  onSave: (next: PipelineStepDefinition) => void;
}

const PRODUCT_LEVEL_OPTIONS: Array<ProductLevel | '*'> = ['*', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

const DEFAULT_CONFIG: CatalogConfig = {
  storage: {
    nasRootPath: '/nas/sdpe/products',
    externalPublish: {
      enabled: false,
      endpoint: '',
      authMode: 'NONE',
      authSecretRef: '',
    },
  },
  collectionMapping: [
    { satelliteId: 'SAT01', productLevel: 'LEVEL_1', collectionId: 'sar-sat01-l1' },
    { satelliteId: 'SAT01', productLevel: 'LEVEL_2', collectionId: 'sar-sat01-l2' },
    { satelliteId: 'SAT01', productLevel: 'LEVEL_3', collectionId: 'sar-sat01-l3' },
    { satelliteId: '*',     productLevel: '*',       collectionId: 'sar-products' },
  ],
  quality: {
    runValidation: true,
    neszThresholdDb: -20,
    pslrThresholdDb: -13,
    failurePolicy: 'BLOCK_REGISTRATION',
  },
  versioning: {
    duplicatePolicy: 'NEW_VERSION_ARCHIVE_PREVIOUS',
    initialStatus: 'PUBLISHED',
    generateThumbnail: true,
    thumbnailMaxPx: 512,
  },
  stacMapping: {
    customProperties: {},
  },
};

function ConfirmedBadge({ note }: { note?: string }) {
  return (
    <span className="inline-flex items-center text-[9px] bg-accent/10 text-accent rounded px-1.5 py-0.5 shrink-0">
      Confirmed{note ? ` · ${note}` : ''}
    </span>
  );
}

function TbcBadge({ note }: { note?: string }) {
  return (
    <span className="inline-flex items-center text-[9px] bg-amber-500/10 text-amber-500 rounded px-1.5 py-0.5 shrink-0">
      TBC{note ? ` · ${note}` : ''}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <span className="inline-flex items-center text-[9px] bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 shrink-0 font-mono">
      {origin}
    </span>
  );
}

export default function CatalogConfigPanel({ step, onSave }: CatalogConfigPanelProps) {
  const initial = step.catalogConfig ?? DEFAULT_CONFIG;

  // Section 1: Storage
  const [nasRootPath, setNasRootPath] = useState(initial.storage.nasRootPath);
  const [extPublishEnabled, setExtPublishEnabled] = useState(initial.storage.externalPublish.enabled);
  const [extEndpoint, setExtEndpoint] = useState(initial.storage.externalPublish.endpoint ?? '');
  const [extAuthMode, setExtAuthMode] = useState<CatalogAuthMode>(initial.storage.externalPublish.authMode ?? 'NONE');
  const [extAuthSecretRef, setExtAuthSecretRef] = useState(initial.storage.externalPublish.authSecretRef ?? '');

  // Section 2: Collection mapping
  const [collectionMapping, setCollectionMapping] = useState<CollectionMappingRule[]>(initial.collectionMapping);

  // Section 3: Quality
  const [runValidation, setRunValidation] = useState(initial.quality.runValidation);
  const [neszThreshold, setNeszThreshold] = useState<number>(initial.quality.neszThresholdDb);
  const [pslrThreshold, setPslrThreshold] = useState<number>(initial.quality.pslrThresholdDb);
  const [qualityFailurePolicy, setQualityFailurePolicy] = useState<CatalogQualityFailurePolicy>(initial.quality.failurePolicy);

  // Section 4: Versioning
  const [duplicatePolicy, setDuplicatePolicy] = useState<CatalogDuplicatePolicy>(initial.versioning.duplicatePolicy);
  const [initialStatus, setInitialStatus] = useState<CatalogInitialStatus>(initial.versioning.initialStatus);
  const [generateThumbnail, setGenerateThumbnail] = useState(initial.versioning.generateThumbnail);
  const [thumbnailMaxPx, setThumbnailMaxPx] = useState<number>(initial.versioning.thumbnailMaxPx ?? 512);

  // Section 5: Custom STAC mapping
  const [customMapping, setCustomMapping] = useState<Array<[string, string]>>(
    Object.entries(initial.stacMapping.customProperties ?? {}),
  );

  const built: CatalogConfig = useMemo(() => ({
    storage: {
      nasRootPath: nasRootPath.trim(),
      externalPublish: {
        enabled: extPublishEnabled,
        endpoint: extPublishEnabled ? (extEndpoint.trim() || undefined) : undefined,
        authMode: extPublishEnabled ? extAuthMode : undefined,
        authSecretRef: extPublishEnabled && extAuthMode !== 'NONE' ? (extAuthSecretRef.trim() || undefined) : undefined,
      },
    },
    collectionMapping: collectionMapping
      .map((r) => ({
        satelliteId: r.satelliteId.trim(),
        productLevel: r.productLevel,
        collectionId: r.collectionId.trim(),
      }))
      .filter((r) => r.satelliteId && r.collectionId),
    quality: {
      runValidation,
      neszThresholdDb: neszThreshold,
      pslrThresholdDb: pslrThreshold,
      failurePolicy: qualityFailurePolicy,
    },
    versioning: {
      duplicatePolicy,
      initialStatus,
      generateThumbnail,
      thumbnailMaxPx: generateThumbnail ? thumbnailMaxPx : undefined,
    },
    stacMapping: {
      customProperties: Object.fromEntries(
        customMapping.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]),
      ),
    },
  }), [
    nasRootPath, extPublishEnabled, extEndpoint, extAuthMode, extAuthSecretRef,
    collectionMapping, runValidation, neszThreshold, pslrThreshold, qualityFailurePolicy,
    duplicatePolicy, initialStatus, generateThumbnail, thumbnailMaxPx, customMapping,
  ]);

  const hasChanges = useMemo(
    () => JSON.stringify(built) !== JSON.stringify(step.catalogConfig ?? DEFAULT_CONFIG),
    [built, step.catalogConfig],
  );

  const handleSave = useCallback(() => {
    onSave({ ...step, catalogConfig: built });
  }, [step, onSave, built]);

  // Collection mapping handlers
  const updateMapping = (idx: number, patch: Partial<CollectionMappingRule>) => {
    setCollectionMapping((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addMappingRow = () => {
    setCollectionMapping((prev) => [...prev, { satelliteId: '', productLevel: '*', collectionId: '' }]);
  };
  const removeMappingRow = (idx: number) => {
    setCollectionMapping((prev) => prev.filter((_, i) => i !== idx));
  };

  // Custom STAC mapping handlers
  const updateCustom = (idx: number, key: string, value: string) => {
    setCustomMapping((prev) => prev.map((row, i) => (i === idx ? [key, value] : row)));
  };
  const addCustomRow = () => setCustomMapping((prev) => [...prev, ['', '']]);
  const removeCustomRow = (idx: number) => setCustomMapping((prev) => prev.filter((_, i) => i !== idx));

  const authOptions: CustomSelectOption<CatalogAuthMode>[] = (
    Object.entries(CATALOG_AUTH_MODE_LABELS) as [CatalogAuthMode, string][]
  ).map(([value, label]) => ({ value, label }));

  const initialStatusOptions: CustomSelectOption<CatalogInitialStatus>[] = (
    Object.entries(CATALOG_INITIAL_STATUS_LABELS) as [CatalogInitialStatus, string][]
  ).map(([value, label]) => ({ value, label }));

  const qualityFailureOptions: CustomSelectOption<CatalogQualityFailurePolicy>[] = (
    Object.entries(CATALOG_QUALITY_FAILURE_POLICY_LABELS) as [CatalogQualityFailurePolicy, string][]
  ).map(([value, label]) => ({ value, label }));

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Catalog Registration</span>
        </div>
        <div className="text-[11px] text-muted-foreground">CSC-07 · SI-06 PostgreSQL/PostGIS write</div>
      </div>

      <div className="h-px bg-border" />

      {/* Section 1: Storage Target */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <HardDrive className="w-3.5 h-3.5 text-accent" />
            Storage Target
          </div>
          <ConfirmedBadge note="ICD §6.8" />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* Read-only DB targets */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="w-2.5 h-2.5" />
              <span>Database (CI-03 DB Interface)</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {['sar_products', 'stac_items', 'stac_collections', 'product_files'].map((t) => (
                <span key={t} className="text-[10px] bg-card border border-border rounded px-1.5 py-0.5 font-mono text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">NAS root (thumbnails, aux files)</label>
            <input
              type="text"
              value={nasRootPath}
              onChange={(e) => setNasRootPath(e.target.value)}
              placeholder="/nas/sdpe/products"
              className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
            />
          </div>

          {/* External STAC publish (optional) */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-foreground">External STAC publish</span>
                <TbcBadge note="optional" />
              </div>
              <button
                type="button"
                onClick={() => setExtPublishEnabled((v) => !v)}
                role="switch"
                aria-checked={extPublishEnabled}
                className={cn(
                  'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                  extPublishEnabled ? 'bg-accent' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                    extPublishEnabled ? 'translate-x-3.5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>

            {extPublishEnabled && (
              <div className="space-y-2">
                <input
                  type="url"
                  value={extEndpoint}
                  onChange={(e) => setExtEndpoint(e.target.value)}
                  placeholder="https://catalog.example/collections/{id}/items"
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                />
                <div className="grid grid-cols-2 gap-2">
                  <CustomSelect<CatalogAuthMode>
                    value={extAuthMode}
                    onChange={setExtAuthMode}
                    options={authOptions}
                  />
                  {extAuthMode !== 'NONE' && (
                    <input
                      type="text"
                      value={extAuthSecretRef}
                      onChange={(e) => setExtAuthSecretRef(e.target.value)}
                      placeholder="vault://sdpe/catalog/api-token"
                      className="bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Collection Mapping */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <Layers className="w-3.5 h-3.5 text-accent" />
            Collection Mapping
          </div>
          <ConfirmedBadge note="SAD 12.3" />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            (satellite_id × product_level) → STAC collection_id. <code className="font-mono">*</code> 는 와일드카드.
          </p>

          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1.4fr_auto] gap-1.5 items-center px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              <span>satellite_id</span>
              <span></span>
              <span>level</span>
              <span></span>
              <span>collection_id</span>
              <span></span>
            </div>
            {collectionMapping.length === 0 && (
              <div className="text-[10px] text-muted-foreground/60 px-1 py-2 italic">
                No mapping rules — registration will fail with no target collection.
              </div>
            )}
            {collectionMapping.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto_1.4fr_auto] gap-1.5 items-center">
                <input
                  type="text"
                  value={row.satelliteId}
                  onChange={(e) => updateMapping(idx, { satelliteId: e.target.value })}
                  placeholder="SAT01"
                  className="bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                />
                <span className="text-muted-foreground/60 text-[10px]">×</span>
                <select
                  value={row.productLevel}
                  onChange={(e) => updateMapping(idx, { productLevel: e.target.value as ProductLevel | '*' })}
                  className="bg-card border border-border rounded-md px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                >
                  {PRODUCT_LEVEL_OPTIONS.map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
                <span className="text-muted-foreground/60 text-[10px]">→</span>
                <input
                  type="text"
                  value={row.collectionId}
                  onChange={(e) => updateMapping(idx, { collectionId: e.target.value })}
                  placeholder="sar-sat01-l1"
                  className="bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => removeMappingRow(idx)}
                  className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Remove rule"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addMappingRow}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-border text-[10px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add rule
          </button>
        </div>
      </div>

      {/* Section 3: Quality Validation */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            Quality Validation
          </div>
          <span className="inline-flex items-center text-[9px] bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 font-mono">
            CSU-07.02
          </span>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-foreground">Run NESZ / PSLR validation</span>
              <TbcBadge note="SI-05 quality_run" />
            </div>
            <button
              type="button"
              onClick={() => setRunValidation((v) => !v)}
              role="switch"
              aria-checked={runValidation}
              className={cn(
                'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                runValidation ? 'bg-accent' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                  runValidation ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {runValidation && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">NESZ threshold (dB)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={neszThreshold}
                    onChange={(e) => setNeszThreshold(Number(e.target.value))}
                    className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">PSLR threshold (dB)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={pslrThreshold}
                    onChange={(e) => setPslrThreshold(Number(e.target.value))}
                    className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">On failure</label>
                <CustomSelect<CatalogQualityFailurePolicy>
                  value={qualityFailurePolicy}
                  onChange={setQualityFailurePolicy}
                  options={qualityFailureOptions}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section 4: Versioning & Lifecycle */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <GitMerge className="w-3.5 h-3.5 text-accent" />
            Versioning &amp; Lifecycle
          </div>
          <ConfirmedBadge note="OPS-04" />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">On duplicate product</label>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.entries(CATALOG_DUPLICATE_POLICY_LABELS) as [CatalogDuplicatePolicy, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDuplicatePolicy(key)}
                  className={cn(
                    'flex-1 min-w-[120px] py-1.5 px-2 rounded-md text-[10px] font-medium transition-colors',
                    duplicatePolicy === key
                      ? 'bg-accent/15 border border-accent/50 text-accent'
                      : 'bg-card border border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Initial sar_products.status</label>
            <CustomSelect<CatalogInitialStatus>
              value={initialStatus}
              onChange={setInitialStatus}
              options={initialStatusOptions}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3 text-accent/80" />
              <span className="text-[10px] text-foreground">Generate thumbnail (CSU-07.06)</span>
            </div>
            <button
              type="button"
              onClick={() => setGenerateThumbnail((v) => !v)}
              role="switch"
              aria-checked={generateThumbnail}
              className={cn(
                'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                generateThumbnail ? 'bg-accent' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                  generateThumbnail ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {generateThumbnail && (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Thumbnail max edge (px)</label>
              <input
                type="number"
                min={64}
                max={4096}
                step={64}
                value={thumbnailMaxPx}
                onChange={(e) => setThumbnailMaxPx(Number(e.target.value))}
                className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Section 5: STAC Item Mapping */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <Pencil className="w-3.5 h-3.5 text-accent" />
            STAC Item Mapping
          </div>
          <ConfirmedBadge note="STAC SAR/EO Ext." />
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          {/* Layer (a): product → sar_products */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <Lock className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">
                Product → sar_products
              </span>
            </div>
            <div className="space-y-0.5">
              {SAR_PRODUCTS_INGEST_MAPPING.map((row) => (
                <div key={row.source} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center text-[10px]">
                  <span className="font-mono text-muted-foreground bg-card/60 border border-border/60 rounded px-1.5 py-0.5 truncate">
                    {row.source}
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="font-mono text-foreground bg-card/60 border border-border/60 rounded px-1.5 py-0.5 truncate">
                    {row.target}
                  </span>
                  <OriginBadge origin={row.origin} />
                </div>
              ))}
            </div>
          </div>

          {/* Layer (b): sar_products → STAC */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center gap-1 mb-1.5">
              <Lock className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">
                sar_products → STAC properties
              </span>
            </div>
            <div className="space-y-0.5">
              {STAC_STANDARD_MAPPING.map((row) => (
                <div key={row.source} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center text-[10px]">
                  <span className="font-mono text-muted-foreground bg-card/60 border border-border/60 rounded px-1.5 py-0.5 truncate">
                    {row.source}
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="font-mono text-foreground bg-card/60 border border-border/60 rounded px-1.5 py-0.5 truncate">
                    {row.target}
                  </span>
                  <OriginBadge origin={row.extension} />
                </div>
              ))}
            </div>
          </div>

          {/* Layer (c): user-defined custom mapping */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">
                Custom additions
              </span>
              <span className="text-[9px] text-muted-foreground/60">key=column, value=stac:property</span>
            </div>

            <div className="space-y-1">
              {customMapping.length === 0 && (
                <div className="text-[10px] text-muted-foreground/60 px-1 py-1 italic">
                  No custom mapping — only the standard SAR/EO Extension fields will be emitted.
                </div>
              )}
              {customMapping.map(([k, v], idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center">
                  <input
                    type="text"
                    value={k}
                    onChange={(e) => updateCustom(idx, e.target.value, v)}
                    placeholder="column_name"
                    className="bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                  />
                  <span className="text-muted-foreground/60 text-[10px]">→</span>
                  <input
                    type="text"
                    value={v}
                    onChange={(e) => updateCustom(idx, k, e.target.value)}
                    placeholder="stac:property"
                    className="bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomRow(idx)}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove row"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addCustomRow}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-border text-[10px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add custom mapping
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-2 border-t border-border">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-30 transition-colors"
        >
          <Save className="w-3 h-3" />
          Apply
        </button>
      </div>

    </div>
  );
}
