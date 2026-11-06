const INIT = `(function(){try{
  var a = localStorage.getItem("zephyr-accent") || "violet";
  document.documentElement.setAttribute("data-accent", a);
  var t = localStorage.getItem("zephyr-theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (t === "dark" || (!t && prefersDark)) document.documentElement.classList.add("dark");
}catch(e){}})();`;

export function AccentInit() {
  return <script id="zephyr-accent-init" dangerouslySetInnerHTML={{ __html: INIT }} />;
}
