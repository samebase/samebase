export function shouldSyncLogoPreviewQueryState(args: {
  isAutoRotating: boolean;
  isSceneInteracting: boolean;
}): boolean {
  return !args.isAutoRotating && !args.isSceneInteracting;
}
