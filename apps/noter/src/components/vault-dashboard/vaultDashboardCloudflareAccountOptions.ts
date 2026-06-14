export type CloudflareAccountOption = {
  accountId: string;
  accountName: string;
};

export function compareCloudflareAccountOptions(
  left: CloudflareAccountOption,
  right: CloudflareAccountOption,
) {
  return (
    left.accountName.localeCompare(right.accountName) ||
    left.accountId.localeCompare(right.accountId)
  );
}
