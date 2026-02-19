export interface AnnotationIssue {
  id:       number
  text:     string
  category: string
  severity: 'low' | 'medium' | 'high'
}

const SEVERITY_COLORS: Record<AnnotationIssue['severity'], string> = {
  low:    '#fbbf24',
  medium: '#f97316',
  high:   '#ef4444',
}

/**
 * Builds a self-contained JavaScript string for injection into a sandboxed webview
 * via webview.executeJavaScript(). The injected code:
 * 1. Walks the DOM text nodes to find text matching each issue
 * 2. Wraps matches in a <mark> element with color-coded highlight
 * 3. Adds a numbered <sup> badge
 * 4. Posts a message via window.postMessage on badge click
 */
export function buildAnnotationScript(issues: AnnotationIssue[]): string {
  // JSON.stringify handles all necessary JS string escaping (backslashes, quotes, etc.)
  const serializedIssues = issues.map(i => ({
    ...i,
    color: SEVERITY_COLORS[i.severity],
  }))

  return `
(function() {
  var issues = ${JSON.stringify(serializedIssues)};

  function wrapTextNode(node, issueId, color, badgeNumber) {
    var parent = node.parentNode;
    if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') return false;
    if (parent.hasAttribute && parent.hasAttribute('data-audit-id')) return false;

    try {
      var range = document.createRange();
      range.selectNode(node);

      var mark = document.createElement('mark');
      mark.setAttribute('data-audit-id', String(issueId));
      mark.style.cssText = 'background:' + color + '33;outline:2px solid ' + color + ';border-radius:2px;cursor:pointer;position:relative;';

      var badge = document.createElement('sup');
      badge.textContent = String(badgeNumber);
      badge.style.cssText = 'background:' + color + ';color:#fff;border-radius:50%;padding:1px 4px;font-size:10px;font-weight:bold;margin-left:2px;vertical-align:super;line-height:1;';

      range.surroundContents(mark);
      mark.appendChild(badge);

      mark.addEventListener('click', function() {
        window.postMessage({ type: 'audit-annotation-click', id: issueId }, '*');
      });

      return true;
    } catch(e) {
      return false;
    }
  }

  issues.forEach(function(issue, idx) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.indexOf(issue.text) !== -1) {
        if (wrapTextNode(node, issue.id, issue.color, idx + 1)) break;
      }
    }
  });
})();
`.trim()
}
