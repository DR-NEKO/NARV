// Persistent bearer session; all private views remain token-bound and are cleared on logout.
export const sessionKey="narv-api-session";
const expiryKey=sessionKey+"-expiry";
export function saveToken(token,expiresAt=Date.now()+30*86400000){
 try{localStorage.setItem(sessionKey,token);localStorage.setItem(expiryKey,String(expiresAt));sessionStorage.removeItem(sessionKey)}
 catch{sessionStorage.setItem(sessionKey,token)}
}
export function forgetToken(){for(const storage of [localStorage,sessionStorage]){storage.removeItem(sessionKey);storage.removeItem(expiryKey)}}
export function getToken(){
 const legacy=sessionStorage.getItem(sessionKey);
 if(legacy){saveToken(legacy);return legacy}
 const token=localStorage.getItem(sessionKey),expires=Number(localStorage.getItem(expiryKey));
 if(token&&expires&&expires<=Date.now()){forgetToken();return null}
 return token;
}
