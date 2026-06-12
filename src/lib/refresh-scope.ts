export function buildAllRefreshFeedWhere(userId: string) {
  return { userId };
}

export function buildFolderRefreshFeedWhere(userId: string, folderId: string) {
  return { userId, folderId };
}
