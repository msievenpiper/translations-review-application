import { type JSX, useRef, useEffect } from 'react'

export interface AnnotationIssue {
  id: number
  text: string
  category: string
  severity: 'low' | 'medium' | 'high'
}

interface Props {
  url: string | null
  issues: AnnotationIssue[]
  onAnnotationClick: (id: number) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#fbbf24',
  medium: '#f97316',
  high: '#ef4444'
}

type ElectronWebview = HTMLElement & {
  executeJavaScript: (script: string) => Promise<unknown>
  addEventListener: (event: string, handler: () => void) => void
  removeEventListener: (event: string, handler: () => void) => void
}

function buildAnnotationScript(issues: AnnotationIssue[]): string {
  const serialized = JSON.stringify(
    issues.map((issue, idx) => ({
      id: issue.id,
      text: issue.text,
      color: SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.medium,
      badge: idx + 1
    }))
  )

  return `
(function() {
  var issues = ${serialized};
  issues.forEach(function(issue) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (!node.textContent || node.textContent.indexOf(issue.text) === -1) continue;
      var parent = node.parentNode;
      if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') continue;
      if (parent.getAttribute && parent.getAttribute('data-audit-id')) continue;
      try {
        var mark = document.createElement('mark');
        mark.setAttribute('data-audit-id', String(issue.id));
        mark.style.cssText = 'background:' + issue.color + '33;outline:2px solid ' + issue.color + ';border-radius:2px;cursor:pointer;';
        var badge = document.createElement('sup');
        badge.textContent = String(issue.badge);
        badge.style.cssText = 'background:' + issue.color + ';color:#fff;border-radius:50%;padding:1px 5px;font-size:10px;font-weight:bold;margin-left:2px;';
        var range = document.createRange();
        range.selectNode(node);
        range.surroundContents(mark);
        mark.appendChild(badge);
        mark.addEventListener('click', function(id) {
          return function() { window.postMessage({ type: 'audit-click', id: id }, '*'); };
        }(issue.id));
        break;
      } catch(e) {}
    }
  });
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'audit-click') {
      window.top && window.top.postMessage(e.data, '*');
    }
  });
})();
`.trim()
}

export function AnnotatedWebview({ url, issues, onAnnotationClick }: Props): JSX.Element {
  const wvRef = useRef<ElectronWebview>(null)

  useEffect(() => {
    const wv = wvRef.current
    if (!wv || !url) return

    function onDomReady(): void {
      if (!wv || !issues.length) return
      const script = buildAnnotationScript(issues)
      wv.executeJavaScript(script).catch(console.error)
    }

    wv.addEventListener('dom-ready', onDomReady)
    return () => wv.removeEventListener('dom-ready', onDomReady)
  }, [url, issues])

  // Listen for postMessage from the webview content
  useEffect(() => {
    function onMessage(e: MessageEvent): void {
      if (e.data?.type === 'audit-click') {
        onAnnotationClick(e.data.id)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onAnnotationClick])

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">🌐</div>
          <p className="text-gray-500 text-sm">Enter a URL and run an audit</p>
          <p className="text-gray-600 text-xs mt-1">
            The audited page will appear here with highlights
          </p>
        </div>
      </div>
    )
  }

  return (
    // @ts-ignore — webview is an Electron-specific element not in standard React JSX types
    <webview ref={wvRef} src={url} className="w-full h-full" style={{ display: 'flex', flex: 1 }} />
  )
}
