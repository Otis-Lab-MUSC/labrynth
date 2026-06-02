import { useShallow } from "zustand/react/shallow";
import { useUpdateStore } from "../store/useUpdateStore";

export function useUpdateCheck() {
  return useUpdateStore(useShallow((s) => ({ update: s.update, dismiss: s.dismiss })));
}
