'use strict';
function openSection(){
  const target=document.getElementById(location.hash.slice(1));
  if(!target)return;
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  target.scrollIntoView({block:'start'});
}
addEventListener('hashchange',openSection);
openSection();
