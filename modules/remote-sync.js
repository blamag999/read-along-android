/* Remote marker synchronization service. UI-facing messages stay provider-neutral. */
// Marker JSON is stored in this app's repository only; PDF and audio remain in R2/local storage.
const GITHUB_OWNER='blamag999',GITHUB_REPO='read-along-android',GITHUB_BRANCH='main',GITHUB_SYNC_DIR='sync_data';
const GITHUB_TOKEN_SESSION_KEY='read_along_android_sync_token_v1';
try { sessionStorage.removeItem('pdf_audio_sync_github_token'); } catch (_) {}
let githubSyncTimer=null;
function getSyncStem(){
  const n = state.pdfFileName || state.currentBookKey || 'truyen';
  return n.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'truyen';
}
function getCloudSyncPath(){return GITHUB_SYNC_DIR+'/'+getSyncStem()+'.json';}
function getGithubToken(){return(sessionStorage.getItem(GITHUB_TOKEN_SESSION_KEY)||'').trim();}
function updateGithubTokenStatus(){
 const token=getGithubToken();
 if(dom.githubTokenStatus)dom.githubTokenStatus.textContent=token?'Đã có token trong phiên hiện tại ('+token.slice(0,8)+'…'+token.slice(-4)+').':'Chưa có token trong phiên này.';
 if(dom.githubTokenInput)dom.githubTokenInput.value='';
}
function saveGithubTokenFromInput(){
 const token=(dom.githubTokenInput?.value||'').trim();
 if(!token){showToast('Hãy nhập token mới trước khi lưu.');dom.githubTokenInput?.focus();return;}
 if(!/^(github_pat_|gh[pousr]_[A-Za-z0-9_]+)/.test(token)){
  if(!confirm('Mã truy cập có định dạng không quen thuộc. Bạn vẫn muốn lưu mã này?'))return;
 }
 try{sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY,token);updateGithubTokenStatus();showToast('Đã lưu mã truy cập trong phiên hiện tại.');}
 catch(e){showToast('Không thể lưu mã truy cập trong phiên trình duyệt.');}
}
function clearGithubToken(){
 if(!getGithubToken()){updateGithubTokenStatus();showToast('Không có token nào đang lưu trong phiên này.');return;}
 if(!confirm('Xóa mã truy cập khỏi phiên trình duyệt hiện tại? Thao tác này không thu hồi quyền đã cấp.'))return;
 sessionStorage.removeItem(GITHUB_TOKEN_SESSION_KEY);
 if(githubSyncTimer){clearTimeout(githubSyncTimer);githubSyncTimer=null;}
 updateGithubTokenStatus();showToast('Đã xóa mã truy cập khỏi phiên trình duyệt.');
}
function encodeBase64Utf8(v){const b=new TextEncoder().encode(v);let x='';for(let i=0;i<b.length;i+=0x8000)x+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(x);}
async function getGithubWriteToken(askForToken=false){
 let token=getGithubToken();
 if(!token&&askForToken){
  token=prompt('Nhập mã truy cập có quyền đọc và ghi tệp đồng bộ. Mã chỉ được giữ trong phiên trình duyệt hiện tại.');
  if(token){token=token.trim();if(token)sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY,token);}
 }
 if(!token&&askForToken)alert('Chưa có mã truy cập. Cần quyền đọc và ghi tệp đồng bộ.');
 return token||'';
}
async function getGitBlobSha(content){
 const bytes=new TextEncoder().encode(content);
 const prefix=new TextEncoder().encode('blob '+bytes.length+'\0');
 const all=new Uint8Array(prefix.length+bytes.length);all.set(prefix);all.set(bytes,prefix.length);
 const digest=await crypto.subtle.digest('SHA-1',all);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function putJsonFileOnGitHub(filename,content,token){
 const safeName=filename.split('/').pop();
 if(!safeName||safeName==='.'||safeName==='..')throw Error('Tên tệp JSON không hợp lệ: '+filename);
 const path=GITHUB_SYNC_DIR+'/'+safeName;
 const url='https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 const localSha=await getGitBlobSha(content);
 const old=await fetch(url+'?ref='+encodeURIComponent(GITHUB_BRANCH),{headers});
 let sha=null;
 if(old.ok){
  const oldData=await old.json();sha=oldData.sha||null;
  if(sha===localSha)return {path,changed:false};
 }else if(old.status!==404)throw Error(filename+': không đọc được tệp mốc hiện có ('+old.status+').');
 const body={message:'Sync changed JSON file '+safeName,content:encodeBase64Utf8(content),branch:GITHUB_BRANCH};
 if(sha)body.sha=sha;
 const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
 if(!res.ok)throw Error(filename+': máy chủ từ chối lưu tệp ('+res.status+').');
 return {path,changed:true};
}
async function syncAllFolderJsonToGitHub({askForToken=false}={}){
 let token=await getGithubWriteToken(askForToken);
 if(!token)return false;
 let files=[];
 try{
  if(state.dirHandle){
   for await(const entry of state.dirHandle.values()){
    if(entry.kind==='file'&&entry.name.toLowerCase().endsWith('.json')){
     files.push({name:entry.name,blob:await entry.getFile()});
    }
   }
  }else{
   files=(state.folderJsonFiles||[]).slice();
  }
 }catch(e){
  alert('Không thể đọc các tệp JSON trong thư mục đã chọn. Hãy chọn lại thư mục và cấp quyền đọc.\\n\\n'+e.message);
  return false;
 }
 if(!files.length){
  showToast('Không tìm thấy tệp JSON trong thư mục đã chọn. Hãy mở thư mục trước khi đồng bộ hàng loạt.');
  return false;
 }
 let changed=0,unchanged=0,failed=[];
 updateSaveStatusBadge('☁️ Đang kiểm tra thay đổi các tệp JSON...');
 for(const item of files){
  try{
   const content=await item.blob.text();
   JSON.parse(content);
   const result=await putJsonFileOnGitHub(item.name,content,token);
   if(result.changed)changed++;else unchanged++;
  }catch(e){failed.push(item.name+': '+e.message);console.error('Lỗi đồng bộ JSON',item.name,e);}
 }
 if(failed.length){
  updateSaveStatusBadge('⚠️ Có '+failed.length+' tệp JSON lỗi');
  alert('Kết quả: '+changed+' tệp đã cập nhật, '+unchanged+' tệp không thay đổi, '+failed.length+' tệp lỗi.\\n\\nTệp lỗi:\\n'+failed.slice(0,10).join('\\n')+(failed.length>10?'\\n...':''));
  return false;
 }
 updateSaveStatusBadge('☁️ '+changed+' tệp cập nhật, '+unchanged+' tệp không đổi');
 showToast(changed?'Đã cập nhật '+changed+' tệp JSON; bỏ qua '+unchanged+' tệp không thay đổi.':'Không có tệp JSON nào thay đổi; không cần tải lên.');
 return true;
}
async function syncCurrentBookToGitHub({askForToken=false}={}){
 if(!state.currentBookKey||!state.pdfFileName){if(askForToken)alert('Vui lòng mở PDF trước khi đồng bộ mốc.');return false;}
 let token=getGithubToken();if(!token&&askForToken){token=prompt('Nhập mã truy cập có quyền đọc và ghi tệp đồng bộ. Mã chỉ được giữ trong phiên trình duyệt hiện tại.');if(token){token=token.trim();sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY,token);}}
 if(!token){if(askForToken)alert('Chưa có mã truy cập. Cần quyền đọc và ghi tệp đồng bộ.');return false;}
 const path=getCloudSyncPath(),url='https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 try{const content=JSON.stringify(state.pageTimestamps,null,2);const localSha=await getGitBlobSha(content);
 const old=await fetch(url+'?ref='+encodeURIComponent(GITHUB_BRANCH),{headers});let sha=null;if(old.ok)sha=(await old.json()).sha||null;else if(old.status!==404)throw Error('Không đọc được tệp mốc hiện có ('+old.status+').');
 if(sha&&sha===localSha){updateSaveStatusBadge('☁️ Mốc đọc đã mới nhất');return true;}
 const body={message:'Sync reading markers for '+getSyncStem(),content:encodeBase64Utf8(content),branch:GITHUB_BRANCH};if(sha)body.sha=sha;
 const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});if(!res.ok)throw Error('Máy chủ từ chối lưu mốc đọc ('+res.status+').');
 updateSaveStatusBadge('☁️ Đã đồng bộ mốc đọc');showToast('☁️ Đã đồng bộ mốc đọc: '+path);return true;
 }catch(e){console.error(e);updateSaveStatusBadge('⚠️ Đồng bộ mốc đọc lỗi');if(askForToken)alert('Không thể đồng bộ mốc đọc. Hãy kiểm tra mã truy cập và quyền ghi.\\n\\n'+e.message);return false;}
}
function scheduleGitHubSync(){
 if(!getGithubToken()||!state.currentBookKey||githubSyncTimer)return;
 // Chờ tối đa 1 phút kể từ thay đổi đầu tiên; không khởi động lại bộ đếm khi tiếp tục sửa.
 githubSyncTimer=setTimeout(async()=>{
  githubSyncTimer=null;
  await syncCurrentBookToGitHub();
 },60000);
}
async function reloadCurrentBookFromGitHub() {
  if (!state.pdfFileName || !state.currentBookKey) {
    showToast('Trước tiên hãy mở PDF cần đồng bộ.');
    return;
  }
  const button = dom.btnLoadFromGithub;
  if (button) { button.disabled = true; button.textContent = '⏳ Đang tải...'; }
  if (dom.btnReloadMarkers) { dom.btnReloadMarkers.disabled = true; dom.btnReloadMarkers.textContent = '…'; }
  updateSaveStatusBadge('☁️ Đang tải mốc đọc...');
  try {
    const loaded = await loadCloudSyncForBook();
    if (loaded) {
      renderSyncTable();
      showToast('Đã cập nhật mốc thời gian.');
    } else {
      updateSaveStatusBadge('⚠️ Không tìm thấy tệp mốc đọc');
      showToast('Không tìm thấy tệp mốc đồng bộ cho tài liệu này.');
    }
  } finally {
    if (button) { button.disabled = false; button.textContent = '⬇️ Tải mốc đọc'; }
    if (dom.btnReloadMarkers) { dom.btnReloadMarkers.disabled = false; dom.btnReloadMarkers.textContent = '⟳'; }
  }
}

async function loadCloudSyncForBook(){
  const stems=[...new Set([getSyncStem(),state.currentBookKey].filter(Boolean))];
  for(const stem of stems){
    // Ưu tiên tên chuẩn mới, sau đó thử tên cũ có hậu tố _sync.
    for(const filename of [stem+'.json',stem+'_sync.json']){
      try{
        const url='https://raw.githubusercontent.com/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/'+GITHUB_BRANCH+'/'+GITHUB_SYNC_DIR+'/'+encodeURIComponent(filename);
        const res=await fetch(url,{cache:'no-store'});
        if(!res.ok)continue;
        const data=await res.json();
        if(data&&typeof data==='object'&&!Array.isArray(data)){
          state.pageTimestamps=data;saveSyncToStorage();updatePageTimestampBadge();updateSyncCountBadge();
          updateSaveStatusBadge('☁️ Đã nạp mốc đọc');return true;
        }
      }catch(e){console.warn('Không thể nạp mốc đọc:',e);}
    }
  }
  return false;
}
