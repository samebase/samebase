type InlineStylePropertySnapshot = {
  priority: string;
  value: string;
};

type WorkspaceResizeBodyStyleLockState = {
  cursor: InlineStylePropertySnapshot;
  ownerCount: number;
  userSelect: InlineStylePropertySnapshot;
};

const workspaceResizeBodyStyleLocks = new WeakMap<HTMLElement, WorkspaceResizeBodyStyleLockState>();

function readInlineStyleProperty(
  style: CSSStyleDeclaration,
  property: "cursor" | "user-select",
): InlineStylePropertySnapshot {
  return {
    priority: style.getPropertyPriority(property),
    value: style.getPropertyValue(property),
  };
}

function restoreInlineStyleProperty(
  style: CSSStyleDeclaration,
  property: "cursor" | "user-select",
  snapshot: InlineStylePropertySnapshot,
) {
  if (snapshot.value === "") {
    style.removeProperty(property);
    return;
  }

  style.setProperty(property, snapshot.value, snapshot.priority);
}

export function acquireWorkspaceResizeBodyStyleLock(body: HTMLElement) {
  const activeLock = workspaceResizeBodyStyleLocks.get(body);
  if (activeLock === undefined) {
    const lockState = {
      cursor: readInlineStyleProperty(body.style, "cursor"),
      ownerCount: 1,
      userSelect: readInlineStyleProperty(body.style, "user-select"),
    } satisfies WorkspaceResizeBodyStyleLockState;
    workspaceResizeBodyStyleLocks.set(body, lockState);
    body.style.setProperty("cursor", "col-resize");
    body.style.setProperty("user-select", "none");
  } else {
    activeLock.ownerCount += 1;
  }

  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;

    const lockState = workspaceResizeBodyStyleLocks.get(body);
    if (lockState === undefined) {
      return;
    }
    lockState.ownerCount -= 1;
    if (lockState.ownerCount > 0) {
      return;
    }

    restoreInlineStyleProperty(body.style, "cursor", lockState.cursor);
    restoreInlineStyleProperty(body.style, "user-select", lockState.userSelect);
    workspaceResizeBodyStyleLocks.delete(body);
  };
}
