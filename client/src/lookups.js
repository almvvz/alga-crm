import { api } from "./api.js";
import { useLoad } from "./components/ui.jsx";

// Tutors and students feed the dropdowns in the forms.
export function useLookups() {
  const t = useLoad(() => api.tutors.list(), []);
  const s = useLoad(() => api.students.list(), []);
  return {
    tutors: t.data ?? [],
    students: s.data ?? [],
    ready: !t.loading && !s.loading,
    error: t.error || s.error,
    reload: () => { t.reload(); s.reload(); },
  };
}
