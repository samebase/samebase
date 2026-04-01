import { buildMachinesWorkspacePath } from "@/lib/noterSync";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

export function MachineLiveControlPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();

  return (
    <Navigate
      replace
      to={buildMachinesWorkspacePath({
        machineId: params.machineId?.trim() ?? null,
        threadId: searchParams.get("threadId")?.trim() ?? null,
      })}
    />
  );
}
