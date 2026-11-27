/**
 * Structure-only snapshot of a page, for writing DOM selectors without sharing content.
 * Keeps tag names, class names, roles and data-attribute NAMES. All text and attribute values are masked.
 */

export interface SkelNode {
  t: string;
  c?: string;
  role?: string;
  data?: string[];
  href?: string;
  text?: string;
  kids?: SkelNode[];
}

const SKIP = new Set(["SCRIPT", "STYLE", "SVG", "PATH", "NOSCRIPT", "LINK", "META", "IMG", "USE"]);
const maskText = (s: string) => s.trim().replace(/[A-Za-z]/g, "x").replace(/\d/g, "9").slice(0, 24);
const maskHref = (h: string) => h.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/[A-Za-z0-9_=%-]{6,}/g, "ID");

export function skeleton(root: Element, budget = { n: 1800 }, depth = 0): SkelNode | null {
  if (budget.n <= 0 || depth > 18 || SKIP.has(root.tagName.toUpperCase())) return null;
  budget.n--;
  const node: SkelNode = { t: root.tagName.toLowerCase() };
  const cls = root.getAttribute("class");
  if (cls) node.c = cls.replace(/\s+/g, " ").slice(0, 120);
  const role = root.getAttribute("role");
  if (role) node.role = role;
  const data = Array.from(root.attributes).map((a) => a.name).filter((n) => n.startsWith("data-") || n.startsWith("aria-"));
  if (data.length) node.data = data.slice(0, 6);
  const href = root.getAttribute("href");
  if (href) node.href = maskHref(href);

  const kids: SkelNode[] = [];
  let own = "";
  for (const ch of Array.from(root.childNodes)) {
    if (ch.nodeType === 3) own += ch.textContent ?? "";
    else if (ch.nodeType === 1) {
      const k = skeleton(ch as Element, budget, depth + 1);
      if (k) kids.push(k);
    }
  }
  if (own.trim()) node.text = maskText(own);
  if (kids.length) node.kids = kids;
  return node;
}

/** Counts of places LinkedIn embeds JSON in the HTML, which a request hook never sees. */
export function embeddedJsonInfo(doc: Document) {
  return {
    codeTags: doc.querySelectorAll("code").length,
    bpr: doc.querySelectorAll("code[id^='bpr-guid']").length,
    jsonScripts: doc.querySelectorAll("script[type='application/json'], script[type='application/ld+json']").length,
    iframes: doc.querySelectorAll("iframe").length,
  };
}

/** The open chat on its own: it sits deeper in the page than the whole-page tree reaches. */
function threadSkeleton(doc: Document) {
  const list = doc.querySelector(".msg-s-message-list-content, .msg-s-message-list, [class*='message-list']");
  return list ? skeleton(list, { n: 2500 }) : null;
}

export function pageSnapshot(doc: Document, url: string) {
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/[A-Za-z0-9_=%-]{12,}/g, "ID");
  return { path, at: new Date().toISOString(), embedded: embeddedJsonInfo(doc), thread: threadSkeleton(doc), tree: skeleton(doc.body) };
}
