const KEY = 'etudia:data:v1';
const empty = () => ({ user: null, subjects: [], courses: [], progress: [], sessions: [], revisionPlan: null });
export function load() { try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); } }
export function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); return data; }
export function reset() { localStorage.removeItem(KEY); }
