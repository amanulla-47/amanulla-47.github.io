document.querySelectorAll('a[href="#"]').forEach(a=>a.addEventListener('click',e=>e.preventDefault()));
const nav=document.querySelector('.nav');
window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>20));