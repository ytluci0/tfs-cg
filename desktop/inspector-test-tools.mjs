// Navigate the actual inspector controls used by operators in native acceptance tests.
export async function inspectorCategory(js,sleep,name,section){
 await js(`document.querySelector('[role="tab"][aria-label="${name} properties"]').click()`);await sleep(100);
 if(section){await js(`(()=>{const e=document.querySelector('[data-property-section="${section}"]');if(!e.open)e.querySelector('summary').click();})()`);await sleep(80);}
}
