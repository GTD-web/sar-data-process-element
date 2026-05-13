'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Upload, Save, Trash2, FileCode2, Code2 } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import type { PipelineStepDefinition } from '@/types/pipeline';
import { getDefaultCode } from './node-code-defaults';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground/70">
      Loading editor…
    </div>
  ),
});

const EXT_TO_LANGUAGE: Record<string, string> = {
  py: 'python',
  pyi: 'python',
  ipynb: 'python',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  c: 'c',
  h: 'cpp',
  hpp: 'cpp',
  rs: 'rust',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  sh: 'shell',
  bash: 'shell',
  m: 'objective-c',
  go: 'go',
  java: 'java',
  scala: 'scala',
  kt: 'kotlin',
  rb: 'ruby',
};

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANGUAGE[ext] ?? 'plaintext';
}

const DEFAULT_TEMPLATE = `# Custom processing code for this SAR stage
# This is mock storage — uploaded code is persisted with the pipeline step.
#
# def run(input_path: str, output_path: str, params: dict) -> None:
#     ...
`;

interface NodeCodeEditorPanelProps {
  step: PipelineStepDefinition;
  onSave: (next: PipelineStepDefinition) => void;
  /** 에디터 본문이 바뀔 때마다 호출 — 외부에서 task 활성 상태 도출용. */
  onCodeChange?: (code: string) => void;
}

export default function NodeCodeEditorPanel({ step, onSave, onCodeChange }: NodeCodeEditorPanelProps) {
  // step에 코드가 없으면 stage별 기본 코드(목 데이터)로 보여준다.
  const fallback = getDefaultCode(step.sarStage);
  const initialCode = step.code ?? fallback?.code ?? '';
  const initialLanguage = step.codeLanguage ?? fallback?.language ?? 'python';
  const initialFilename = step.codeFilename ?? fallback?.filename ?? '';

  const [code, setCode] = useState<string>(initialCode);
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [filename, setFilename] = useState<string>(initialFilename);
  const [dirty, setDirty] = useState(false);
  /** 진짜 natives 소스를 가져오는 중 표시. step.code 가 있으면 fetch 안 함. */
  const [sourceLoading, setSourceLoading] = useState(false);
  /** /api/sar/source 가 응답한 실제 파일 출처 표시 (진짜 코드인지 mock fallback 인지). */
  const [sourceOrigin, setSourceOrigin] = useState<'real' | 'mock' | 'user'>(
    step.code ? 'user' : 'mock',
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fb = getDefaultCode(step.sarStage);

    // 사용자가 이미 편집한 코드(step.code) 가 있으면 그것 우선.
    if (step.code) {
      setCode(step.code);
      setLanguage(step.codeLanguage ?? fb?.language ?? 'python');
      setFilename(step.codeFilename ?? fb?.filename ?? '');
      setDirty(false);
      setSourceOrigin('user');
      onCodeChange?.(step.code);
      return;
    }

    // 진짜 natives 소스 fetch 시도.
    let cancelled = false;
    const stage = step.sarStage;
    if (!stage) {
      setCode('');
      setLanguage('python');
      setFilename('');
      setDirty(false);
      setSourceOrigin('mock');
      onCodeChange?.('');
      return;
    }

    setSourceLoading(true);
    fetch(`/api/sar/source/${stage}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const text = await res.text();
          const fname = res.headers.get('x-filename') ?? fb?.filename ?? '';
          setCode(text);
          setLanguage('python');
          setFilename(fname);
          setSourceOrigin('real');
          onCodeChange?.(text);
        } else {
          // 매핑 없는 stage 는 mock fallback
          const fbCode = fb?.code ?? '';
          setCode(fbCode);
          setLanguage(fb?.language ?? 'python');
          setFilename(fb?.filename ?? '');
          setSourceOrigin('mock');
          onCodeChange?.(fbCode);
        }
        setDirty(false);
      })
      .catch(() => {
        if (cancelled) return;
        const fbCode = fb?.code ?? '';
        setCode(fbCode);
        setLanguage(fb?.language ?? 'python');
        setFilename(fb?.filename ?? '');
        setDirty(false);
        setSourceOrigin('mock');
        onCodeChange?.(fbCode);
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step.order, step.sarStage, step.code, step.codeLanguage, step.codeFilename, onCodeChange]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const MAX_BYTES = 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error('Code file must be under 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setCode(content);
      setLanguage(detectLanguage(file.name));
      setFilename(file.name);
      setDirty(true);
      onCodeChange?.(content);
      toast.success(`Loaded "${file.name}"`);
    };
    reader.onerror = () => toast.error('Failed to read file.');
    reader.readAsText(file);
  }, [onCodeChange]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    const next = value ?? '';
    setCode(next);
    setDirty(true);
    onCodeChange?.(next);
  }, [onCodeChange]);

  const handleSave = useCallback(() => {
    // 진짜 natives 소스를 편집한 거면 confirm 으로 한 번 더 묻는다.
    // 실제 디스크 파일은 변경하지 않고 in-memory step.code 에만 보관 (시연 안전장치).
    const ok = window.confirm(
      'Are you sure you want to apply these changes? This will modify the production code that runs in the actual environment.',
    );
    if (!ok) return;
    onSave({
      ...step,
      code,
      codeLanguage: language,
      codeFilename: filename || undefined,
    });
    setDirty(false);
    setSourceOrigin('user');
    toast.success('These changes will take effect in the production environment.');
  }, [onSave, step, code, language, filename]);

  const handleClear = useCallback(() => {
    setCode('');
    setFilename('');
    setLanguage('python');
    setDirty(true);
    onCodeChange?.('');
  }, [onCodeChange]);

  const handleInsertTemplate = useCallback(() => {
    setCode(DEFAULT_TEMPLATE);
    setLanguage('python');
    setFilename(filename || 'processor.py');
    setDirty(true);
    onCodeChange?.(DEFAULT_TEMPLATE);
  }, [filename, onCodeChange]);

  const hasContent = code.trim().length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <button
          type="button"
          onClick={handleUploadClick}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold text-accent-foreground transition-colors hover:brightness-110"
        >
          <Upload className="h-3 w-3" />
          Upload code
        </button>
        <button
          type="button"
          onClick={handleInsertTemplate}
          disabled={hasContent}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Code2 className="h-3 w-3" />
          Insert template
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FileCode2 className="h-3 w-3" />
          {filename ? (
            <span className="font-mono text-foreground/80">{filename}</span>
          ) : (
            <span className="italic">No file</span>
          )}
          {sourceLoading && (
            <span className="ml-1 italic text-muted-foreground/60">loading…</span>
          )}
          {!sourceLoading && sourceOrigin === 'real' && (
            <span
              className="ml-1 rounded bg-success/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success"
              title="Live source from natives/csc-04/ inside the container"
              data-testid="code-source-badge"
            >
              Live source
            </span>
          )}
          {!sourceLoading && sourceOrigin === 'mock' && (
            <span
              className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600"
              title="No real source mapped for this stage yet — showing placeholder"
              data-testid="code-source-badge"
            >
              Mock
            </span>
          )}
          {!sourceLoading && sourceOrigin === 'user' && (
            <span
              className="ml-1 rounded bg-accent/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent"
              title="In-memory user edits — disk file is not modified"
              data-testid="code-source-badge"
            >
              User edit
            </span>
          )}
        </div>

        <select
          value={language}
          onChange={(e) => { setLanguage(e.target.value); setDirty(true); }}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          {['python', 'cpp', 'c', 'rust', 'go', 'shell', 'plaintext'].map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasContent}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold text-accent-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            {dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".py,.cpp,.cc,.cxx,.c,.h,.hpp,.rs,.ts,.tsx,.js,.jsx,.json,.yml,.yaml,.toml,.sh,.bash,.m,.go,.java,.scala,.kt,.rb,.txt"
          onChange={handleFileSelected}
          className="hidden"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          theme="vs-dark"
          language={language}
          value={code}
          onChange={handleEditorChange}
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: 'on',
            renderLineHighlight: 'line',
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
}
