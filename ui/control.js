"use strict";

const controlSources = ["/control-core.js?v=1", "/control-mission-read.js?v=1", "/control-mission-execute.js?v=1", "/control-bootstrap.js?v=1"];
function loadControlSource(index = 0) {
  if (index >= controlSources.length) return;
  const script = document.createElement("script");
  script.src = controlSources[index];
  script.async = false;
  script.onload = () => loadControlSource(index + 1);
  script.onerror = () => {
    const toast = document.getElementById("toast");
    if (toast) { toast.textContent = `Control runtime failed to load: ${controlSources[index]}`; toast.classList.add("show"); }
  };
  document.head.appendChild(script);
}
loadControlSource();
