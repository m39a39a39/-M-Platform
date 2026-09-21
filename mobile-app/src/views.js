const views=['bootView','guestView','loginView','registerView','resetView','sessionView','appView'];
export function showView(id){
  for(const view of views)document.getElementById(view)?.classList.toggle('hidden',view!==id);
  window.scrollTo({top:0,behavior:'instant'});
  window.dispatchEvent(new CustomEvent('mplatform:view',{detail:{id}}));
}
