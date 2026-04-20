'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export { toast };

/**
 * 프로젝트 테마에 맞춰 sonner Toaster를 커스텀한다.
 * - 다크 배경(card) + 보더(border) 기본 스타일
 * - success/error/warning/info 타입별 컬러 강조
 */
export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group !bg-card !text-foreground !border !border-border !rounded-lg !shadow-xl !text-xs !px-3 !py-2.5',
          title: '!text-xs !text-foreground',
          description: '!text-[11px] !text-muted-foreground',
          actionButton: '!bg-accent !text-accent-foreground',
          cancelButton: '!bg-muted !text-muted-foreground',
          closeButton:
            '!bg-card !border-border !text-muted-foreground hover:!text-foreground',
          success: '!border-success/40',
          error: '!border-destructive/40',
          warning: '!border-amber-500/40',
          info: '!border-accent/40',
          icon: 'flex-shrink-0',
        },
      }}
    />
  );
}
