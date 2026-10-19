// load the page again past any cached copy; at most once per new build, so a stale cache can't loop
export function freshReload(key = "chunk") {
  let tried = null; try { tried = sessionStorage.getItem("reloadedFor"); } catch {}
  if (tried === key) return false;
  try { sessionStorage.setItem("reloadedFor", key); } catch {}
  location.replace(location.pathname + "?v=" + Date.now() + location.hash);
  return true;
}
