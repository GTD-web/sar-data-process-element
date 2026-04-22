/**
 * renderer/pages/_document.page.tsx 로 배치 (Lumir 의 .page.tsx 네이밍)
 *
 * React 하이드레이션 전에 localStorage 를 읽어 <html> 에 dark 클래스를 적용/제거합니다.
 * 이 스크립트가 없으면 페이지 로드 시 라이트 → 다크 플래시가 발생합니다.
 *
 * 기본 테마를 다크로 두려면 아래 DEFAULT 를 'dark' 로 변경하세요.
 */

import { Html, Head, Main, NextScript } from 'next/document';

const DEFAULT = 'light'; // or 'dark'

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('sdpe-theme') || '${DEFAULT}';
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    ${DEFAULT === 'dark' ? "document.documentElement.classList.add('dark');" : ''}
  }
})();
`.trim();

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
