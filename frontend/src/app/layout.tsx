import type { Metadata, Viewport } from 'next';
import Toaster from '@/components/ui/Toast';
import PwaInstallPrompt from '@/components/ui/PwaInstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'SDPE DAG',
  description: 'SAR Data Processing Pipeline Operations Console',
  applicationName: 'SDPE DAG',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SDPE DAG',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d1f45',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sdpe-theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="h-full overflow-hidden">
        {children}
        <Toaster />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
