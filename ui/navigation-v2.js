"use strict";

window.CYVX_NAV = [
  {id:"home",label:"Home"},
  {id:"chat",label:"Chat"},
  {id:"goals",label:"Goals"},
  {id:"assets",label:"Assets"},
  {id:"progress",label:"Progress"},
  {id:"advanced",label:"Advanced"}
];

function buildNavigationV2(){
  const nav=document.querySelector(".side-nav");
  if(!nav) return;

  nav.innerHTML="";

  window.CYVX_NAV.forEach(item=>{
    const btn=document.createElement("button");
    btn.textContent=item.label;
    btn.dataset.page=item.id;
    nav.appendChild(btn);
  });

  nav.querySelector("button")?.classList.add("active");
}

window.addEventListener("DOMContentLoaded",buildNavigationV2);
