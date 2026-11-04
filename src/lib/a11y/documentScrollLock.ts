type Lock = { owners: number; restore: () => void };

const documents = new WeakMap<Document, Lock>();
const sheets = new WeakMap<HTMLElement, Lock>();

function overrideStyle(node: HTMLElement, properties: Record<string, string>) {
  const original = node.getAttribute('style');
  const saved = Object.keys(properties).map((name) => ({
    name,
    value: node.style.getPropertyValue(name),
    priority: node.style.getPropertyPriority(name),
  }));
  for (const [name, value] of Object.entries(properties)) {
    node.style.setProperty(name, value, 'important');
  }
  const locked = node.getAttribute('style');

  return () => {
    if (node.getAttribute('style') === locked) {
      if (original === null) node.removeAttribute('style');
      else node.setAttribute('style', original);
    } else {
      // Other owners may update unrelated inline styles while the sheet is open.
      for (const { name, value, priority } of saved) {
        if (value) node.style.setProperty(name, value, priority);
        else node.style.removeProperty(name);
      }
    }
  };
}

/**
 * Lock the page, not the sheet; release only after the last modal unmounts.
 * Attach after focusTrap so restoring the opener cannot displace the saved page position.
 */
export function documentScrollLock(node: HTMLElement) {
  const doc = node.ownerDocument;
  const view = doc.defaultView!;
  let page = documents.get(doc);
  if (!page) {
    const { scrollX, scrollY } = view;
    const restoreRoot = overrideStyle(doc.documentElement, {
      'overflow-x': 'hidden',
      'overflow-y': 'hidden',
      'overscroll-behavior-x': 'none',
      'overscroll-behavior-y': 'none',
    });
    const restoreBody = overrideStyle(doc.body, {
      'overflow-x': 'hidden',
      'overflow-y': 'hidden',
    });
    page = {
      owners: 0,
      restore() {
        restoreBody();
        restoreRoot();
        view.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      },
    };
    documents.set(doc, page);
  }
  page.owners++;

  let sheet = sheets.get(node);
  if (!sheet) {
    sheet = {
      owners: 0,
      restore: overrideStyle(node, {
        'overscroll-behavior-x': 'contain',
        'overscroll-behavior-y': 'contain',
      }),
    };
    sheets.set(node, sheet);
  }
  sheet.owners++;

  let released = false;
  return {
    destroy() {
      if (released) return;
      released = true;
      if (--sheet.owners === 0) {
        sheet.restore();
        sheets.delete(node);
      }
      if (--page.owners === 0) {
        page.restore();
        documents.delete(doc);
      }
    },
  };
}
