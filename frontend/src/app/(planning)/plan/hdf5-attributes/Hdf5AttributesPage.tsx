'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import LeftSidebar from '@/components/panels/LeftSidebar';
import { toast } from '@/components/ui/Toast';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { cn, formatKST, formatRelativeTime } from '@/lib/utils';
import type { Hdf5AttributeEntry, Hdf5FileSummary, Hdf5NodeSummary } from '@/types/pipeline';
import {
  Binary,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FileJson,
  Folder,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Search,
  TriangleAlert,
  Upload,
} from 'lucide-react';

const UPLOAD_STATUS_MIN_VISIBLE_MS = 900;

type UploadQueueItem = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  status: 'uploading' | 'uploaded' | 'failed';
  message: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createUploadQueueId(file: File, index: number): string {
  return globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.size}-${Date.now()}-${index}`;
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex >= 3 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatAttributeValue(value: Hdf5AttributeEntry['value']): string {
  if (Array.isArray(value)) {
    return value.length > 5 ? `${value.slice(0, 5).join(', ')}, ...` : value.join(', ');
  }
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1e6 || (Math.abs(value) < 1e-4 && value !== 0)) return value.toExponential(3);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function findEffectiveAttributes(file: Hdf5FileSummary | null, nodePath: string | null): Hdf5AttributeEntry[] {
  if (!file) return [];
  if (!nodePath) return file.attributes[`/${file.fileName}`] ?? [];

  let currentPath = nodePath;
  while (currentPath.length > 0) {
    const attrs = file.attributes[currentPath];
    if (attrs && attrs.length > 0) return attrs;
    const nextPath = currentPath.slice(0, Math.max(0, currentPath.lastIndexOf('/')));
    if (!nextPath || nextPath === currentPath) break;
    currentPath = nextPath;
  }

  return file.attributes[`/${file.fileName}`] ?? [];
}

function buildTree(nodes: Hdf5NodeSummary[]) {
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path));
  return sorted.map((node) => ({
    ...node,
    level: Math.max(0, node.path.split('/').filter(Boolean).length - 1),
  }));
}

function nodeTypeLabel(node: Hdf5NodeSummary | null): string {
  if (!node) return 'File';
  if (node.type === 'group') return 'Group';
  if (node.type === 'dataset') return 'Dataset';
  return 'File';
}

export default function Hdf5AttributesPage() {
  const service = usePipelineService();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [files, setFiles] = useState<Hdf5FileSummary[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedNodePath, setSelectedNodePath] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [filePanelOpen, setFilePanelOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const res = await service.HDF5_애트리뷰트_목록을_조회한다();
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to load HDF5 attributes list');
        setLoading(false);
        return;
      }
      const data = res.data;
      setFiles(data);
      setSelectedFileId((current) => current ?? data[0]?.id ?? null);
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [service]);

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? null,
    [files, selectedFileId],
  );

  useEffect(() => {
    if (!selectedFile) {
      setSelectedNodePath(null);
      return;
    }
    const exists = selectedFile.nodes.some((node) => node.path === selectedNodePath);
    if (!exists) {
      setSelectedNodePath(selectedFile.nodes[0]?.path ?? null);
    }
  }, [selectedFile, selectedNodePath]);

  const filteredNodes = useMemo(() => {
    if (!selectedFile) return [];
    const keyword = deferredSearch.trim().toLowerCase();
    const allNodes = buildTree(selectedFile.nodes);
    if (!keyword) return allNodes;
    return allNodes.filter((node) =>
      node.name.toLowerCase().includes(keyword) ||
      node.path.toLowerCase().includes(keyword) ||
      node.type.toLowerCase().includes(keyword),
    );
  }, [deferredSearch, selectedFile]);

  const selectedNode = useMemo(
    () => selectedFile?.nodes.find((node) => node.path === selectedNodePath) ?? null,
    [selectedFile, selectedNodePath],
  );

  const effectiveAttributes = useMemo(
    () => findEffectiveAttributes(selectedFile, selectedNodePath),
    [selectedFile, selectedNodePath],
  );

  const additionalInfo = useMemo(() => {
    if (!selectedFile) return [];
    return [
      { property: 'Group Names', value: JSON.stringify(selectedFile.rootGroups) },
      { property: 'First Group Name', value: selectedFile.rootGroups[0] ?? '-' },
    ];
  }, [selectedFile]);

  const generalInfo = useMemo(() => {
    if (!selectedFile) return [];
    return [
      { property: 'Node', value: selectedNode?.path ?? `/${selectedFile.fileName}` },
      { property: 'Type', value: nodeTypeLabel(selectedNode) },
      { property: 'File Size', value: formatFileSize(selectedFile.fileSizeBytes) },
      { property: 'Captured At', value: formatKST(selectedFile.capturedAt) },
      { property: 'Received At', value: formatKST(selectedFile.receivedAt) },
      ...(selectedNode?.shape ? [{ property: 'Shape', value: `(${selectedNode.shape.join(', ')})` }] : []),
      ...(selectedNode?.dtype ? [{ property: 'Dtype', value: selectedNode.dtype }] : []),
    ];
  }, [selectedFile, selectedNode]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (selectedFiles.length === 0) return;

    setUploading(true);
    setFilePanelOpen(true);

    const uploadedFiles: Hdf5FileSummary[] = [];
    const queuedUploads = selectedFiles.map((file, index) => ({
      id: createUploadQueueId(file, index),
      fileName: file.name,
      fileSizeBytes: file.size,
      status: 'uploading' as const,
      message: 'The browser is sending the HDF5 file to the server. The upload request is in progress regardless of save completion.',
    }));
    setUploadQueue(queuedUploads);

    try {
      for (const [index, file] of selectedFiles.entries()) {
        const queuedUpload = queuedUploads[index];
        const [result] = await Promise.all([
          service.HDF5_파일을_업로드한다(file),
          wait(UPLOAD_STATUS_MIN_VISIBLE_MS),
        ]);

        if (!result.success || !result.data) {
          const message = result.message || 'Failed to confirm save.';
          setUploadQueue((current) =>
            current.map((item) =>
              item.id === queuedUpload.id
                ? {
                    ...item,
                    status: 'failed',
                    message: `${message} The upload request was sent, but the file save/parse result could not be confirmed.`,
                  }
                : item,
            ),
          );
          toast.error(result.message || `Failed to upload "${file.name}".`);
          continue;
        }

        uploadedFiles.push(result.data);
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === queuedUpload.id
              ? {
                  ...item,
                  status: 'uploaded',
                  message: 'Upload request completed and reflected in the HDF5 list.',
                }
              : item,
          ),
        );
      }

      if (uploadedFiles.length > 0) {
        const newestFile = uploadedFiles[0];
        startTransition(() => {
          setFiles((current) => [...uploadedFiles, ...current]);
          setSelectedFileId(newestFile.id);
          setSelectedNodePath(newestFile.nodes[0]?.path ?? null);
          setSearch('');
        });
        toast.success(
          uploadedFiles.length === 1
            ? `"${uploadedFiles[0].fileName}" has been added.`
            : `${uploadedFiles.length} HDF5 files have been added.`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full bg-background">
      <LeftSidebar
        mode="nav"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        activePage="hdf5-attributes"
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="border-b border-border bg-card px-3 py-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-foreground">HDF5 Object Info</div>
              <div className="text-[10px] text-muted-foreground">
                Level-0 product schema · output of CSC-03 (Level-0 Processor)
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {selectedFile ? `${selectedFile.nodes.length} nodes · ${effectiveAttributes.length} attrs · ${formatRelativeTime(selectedFile.receivedAt)}` : 'No file loaded'}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r border-border bg-card">
              <input
                ref={fileInputRef}
                type="file"
                accept=".h5,.hdf5,application/x-hdf5"
                multiple
                className="hidden"
                onChange={(event) => void handleFileUpload(event)}
              />
              <div className="flex min-h-0 flex-1 flex-col">
                <button
                  type="button"
                  onClick={() => setFilePanelOpen((value) => !value)}
                  className="flex items-center justify-between border-b border-border bg-card px-2.5 py-1.5 text-left"
                >
                  <span className="text-[11px] font-semibold text-foreground">HDF5 File</span>
                  {filePanelOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <div className="border-b border-border bg-muted/20 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] font-medium transition-colors',
                      uploading
                        ? 'cursor-wait border-border bg-muted/40 text-muted-foreground'
                        : 'border-accent/35 bg-background text-foreground hover:border-accent hover:bg-accent/8',
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 text-accent" />
                    )}
                    {uploading ? 'Uploading HDF5...' : 'Upload HDF5 File'}
                  </button>
                  <div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    Add `.h5` or `.hdf5` files and select them directly from the left tree.
                  </div>
                  {uploadQueue.length > 0 && (
                    <div className="mt-2 space-y-1.5" aria-live="polite">
                      {uploadQueue.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'overflow-hidden rounded-md border bg-background px-2 py-1.5',
                            item.status === 'uploading' && 'border-accent/35',
                            item.status === 'uploaded' && 'border-success/35',
                            item.status === 'failed' && 'border-destructive/35',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">
                              {item.status === 'uploading' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                              ) : item.status === 'uploaded' ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-[10px] font-semibold text-foreground">{item.fileName}</span>
                                <span className="shrink-0 text-[9px] text-muted-foreground">{formatFileSize(item.fileSizeBytes)}</span>
                              </div>
                              <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{item.message}</p>
                              {item.status === 'uploading' && (
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {filePanelOpen && (
                  <div className="min-h-0 flex-1 overflow-y-auto bg-background text-foreground">
                    {loading ? (
                      <div className="px-2.5 py-4 text-[11px] text-muted-foreground">Loading HDF5 file metadata...</div>
                    ) : (
                      <div>
                        {files.map((file) => {
                          const activeFile = selectedFile?.id === file.id;
                          return (
                            <div key={file.id} className="border-b border-border">
                              <button
                                type="button"
                                onClick={() => setSelectedFileId(file.id)}
                                className={cn(
                                  'flex w-full items-center gap-2 px-2 py-1 text-left text-[12px]',
                                  activeFile
                                    ? 'bg-accent/12 text-foreground'
                                    : 'hover:bg-muted/35 text-foreground',
                                )}
                              >
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                <HardDriveDownload className="h-3.5 w-3.5 text-accent" />
                                <span className="truncate font-medium">{file.fileName}</span>
                              </button>
                              {activeFile && (
                                <div className="pb-1">
                                  {filteredNodes.map((node) => {
                                    const activeNode = selectedNode?.path === node.path;
                                    const isFolder = node.type !== 'dataset';
                                    return (
                                      <button
                                        key={node.path}
                                        type="button"
                                        onClick={() => setSelectedNodePath(node.path)}
                                        className={cn(
                                          'flex w-full items-center gap-1.5 px-2 py-[3px] text-left text-[11px]',
                                          activeNode
                                            ? 'bg-accent/15 text-foreground'
                                            : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground',
                                        )}
                                        style={{ paddingLeft: `${10 + node.level * 18}px` }}
                                      >
                                        {isFolder ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <span className="w-3" />}
                                        {isFolder ? (
                                          activeNode
                                            ? <FolderOpen className="h-3.5 w-3.5 text-warning" />
                                            : <Folder className="h-3.5 w-3.5 text-warning" />
                                        ) : (
                                          <Binary className="h-3.5 w-3.5 text-accent" />
                                        )}
                                        <span className="truncate">{node.name}</span>
                                        {node.attributeCount > 0 && (
                                          <span className="ml-auto text-[9px] text-muted-foreground">Attributes {node.attributeCount}</span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>

            <main className="flex min-h-0 flex-col bg-background">
              <div className="border-b border-border bg-card px-3 py-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileJson className="h-3.5 w-3.5 text-accent" />
                    <span className="text-[12px] font-semibold text-foreground">Object Info</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {selectedNode?.path ?? (selectedFile ? `/${selectedFile.fileName}` : '-')}
                    </span>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search nodes"
                      className="w-full rounded border border-border bg-background py-1 pl-8 pr-2 text-[11px] text-foreground outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
                <section className="border border-border bg-card">
                  <div className="border-b border-border px-2 py-1 text-[12px] font-semibold text-foreground">
                    Additional Info
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/35 text-left text-[10px] text-muted-foreground">
                        <th className="px-2 py-0.5 font-medium">Property</th>
                        <th className="px-2 py-0.5 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {additionalInfo.map((row) => (
                        <tr key={row.property} className="border-b border-border">
                          <td className="px-2 py-0.5 text-foreground">{row.property}</td>
                          <td className="px-2 py-0.5 font-mono text-foreground">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="mt-2 border border-border bg-card">
                  <div className="border-b border-border px-2 py-1 text-[12px] font-semibold text-foreground">
                    Object Attribute Info
                  </div>
                  <div className="px-2 py-1 text-[10px] text-muted-foreground">
                    <div>Attribute Creation Order: Creation Order NOT Tracked</div>
                    <div className="mt-0.5">Number of attributes = {effectiveAttributes.length}</div>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-y border-border bg-muted/35 text-left text-[10px] text-muted-foreground">
                        <th className="px-2 py-0.5 font-medium">Name</th>
                        <th className="px-2 py-0.5 font-medium">Type</th>
                        <th className="px-2 py-0.5 font-medium">Array Size</th>
                        <th className="px-2 py-0.5 font-medium">Value[50](...)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveAttributes.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-2 py-5 text-center text-[10px] text-muted-foreground">
                            No attributes for the selected node.
                          </td>
                        </tr>
                      ) : (
                        effectiveAttributes.map((attribute) => (
                          <tr key={`${attribute.name}-${attribute.variableName ?? 'value'}`} className="border-b border-border align-top">
                            <td className="px-2 py-0.5 text-foreground">{attribute.name}</td>
                            <td className="px-2 py-0.5 text-muted-foreground">{attribute.type}</td>
                            <td className="px-2 py-0.5 text-muted-foreground">{attribute.arraySize}</td>
                            <td className="px-2 py-0.5 font-mono text-foreground">{formatAttributeValue(attribute.value)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>

                <section className="mt-2 border border-border bg-card">
                  <div className="border-b border-border px-2 py-1 text-[12px] font-semibold text-foreground">
                    General Object Info
                  </div>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {generalInfo.map((row) => (
                        <tr key={row.property} className="border-b border-border">
                          <td className="w-44 px-2 py-0.5 text-muted-foreground">{row.property}</td>
                          <td className="px-2 py-0.5 text-foreground">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
