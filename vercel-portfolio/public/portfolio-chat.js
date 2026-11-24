export function openPortfolioChat(host){
 const form=document.createElement('form'),input=document.createElement('input'),send=document.createElement('button'),log=document.createElement('div');
 log.setAttribute('role','log');log.className='chat-log';input.maxLength=600;input.required=true;input.placeholder='What is Maha’s current FYP?';input.setAttribute('aria-label','Your portfolio question');send.textContent='Ask';form.className='chat-form';form.append(input,send);host.append(log,form);
 form.onsubmit=async event=>{event.preventDefault();const question=input.value.trim();if(!question||send.disabled)return;const q=document.createElement('strong'),a=document.createElement('p');q.textContent=question;a.textContent='Searching…';log.append(q,a);send.disabled=true;input.value='';
 try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});const d=await r.json();if(!r.ok)throw Error(d.error);a.textContent=(d.mode==='excerpt'?'Portfolio excerpt · ':'')+d.answer;
 for(const [i,s] of d.sources.entries()){const link=document.createElement('a');link.href=s.url;link.textContent='['+(i+1)+'] '+s.title;link.target='_blank';link.rel='noopener';log.append(link);}
 }catch{a.textContent='Chat is unavailable. Please retry using the portfolio server.';input.value=question;}finally{send.disabled=false;log.scrollTop=log.scrollHeight;if(form.isConnected)input.focus();}};
}
