import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, query, limitToLast, onDisconnect, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, SHARED_PIN } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const gate=$("gate"), app=$("app"), pinForm=$("pin-form"), pinInput=$("pin"), gateError=$("gate-error");
const roomKey = new URLSearchParams(location.hash.slice(1)).get("room");
let db, uid, roomRef, pc, localStream, callId, isCaller=false, callUnsubs=[];
let seenMessageIds = new Set();
const rtcConfig={iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]};

if(!roomKey){
  const key=crypto.getRandomValues(new Uint8Array(24));
  const generated=[...key].map(x=>x.toString(16).padStart(2,"0")).join("");
  history.replaceState(null,"",location.pathname+location.search+"#room="+generated);
}
const activeRoom = roomKey || new URLSearchParams(location.hash.slice(1)).get("room");
pinForm.addEventListener("submit", async e=>{
  e.preventDefault();
  if(pinInput.value!==SHARED_PIN){gateError.textContent="That PIN doesn't look right. Try again.";pinInput.value="";return;}
  if(firebaseConfig.apiKey.startsWith("PASTE")){gateError.textContent="The app still needs your Firebase configuration. Follow the README setup steps.";return;}
  gateError.textContent="Opening your world…";
  try{
    const appFirebase=initializeApp(firebaseConfig);const auth=getAuth(appFirebase);
    const credential=await signInAnonymously(auth);uid=credential.user.uid;
    db=getDatabase(appFirebase);roomRef=ref(db,`rooms/${activeRoom}`);
    gate.classList.add("hidden");app.classList.remove("hidden");
    startPresence();listenMessages();listenPresence();listenIncomingCalls();
  }catch(err){console.error(err);gateError.textContent="Couldn't connect. Check Firebase setup and try again.";}
});
function startPresence(){
  const myPresence=ref(db,`rooms/${activeRoom}/presence/${uid}`);
  onValue(ref(db,".info/connected"),snap=>{
    if(snap.val()===true){onDisconnect(myPresence).remove();set(myPresence,{online:true,lastSeen:serverTimestamp()});}
  });
}
function listenPresence(){
  onValue(ref(db,`rooms/${activeRoom}/presence`),snap=>{
    const people=snap.val()||{};const others=Object.entries(people).filter(([id,p])=>id!==uid&&p.online);
    $("presence-text").textContent=others.length?"Your person is here. Go say hello. 💗":"Your person is away right now. Leave a little message.";
    $("status-line").classList.toggle("online",others.length>0);
    $("status-line").innerHTML=others.length?'<i></i> Your person is online':'<i></i> You're in your little world';
  });
}
function listenMessages(){
  const msgs=query(ref(db,`rooms/${activeRoom}/messages`),limitToLast(300));
  onValue(msgs,snap=>{
    const box=$("messages");box.innerHTML="";const data=snap.val()||{};const entries=Object.entries(data);
    if(!entries.length){box.innerHTML='<div class="empty">Your story starts with a hello. 💗</div>';return;}
    for(const [id,m] of entries){
      const div=document.createElement("div");div.className="bubble"+(m.sender===uid?" mine":"");
      const body=document.createElement("div");body.textContent=m.text||"";const time=document.createElement("div");time.className="time";
      time.textContent=new Date(m.createdAt||Date.now()).toLocaleString([], {hour:"2-digit",minute:"2-digit",month:"short",day:"numeric"});
      div.append(body,time);box.append(div);seenMessageIds.add(id);
    }box.scrollTop=box.scrollHeight;
  });
}
$("message-form").addEventListener("submit",async e=>{
  e.preventDefault();const input=$("message-input");const text=input.value.trim();if(!text)return;
  input.value="";try{await push(ref(db,`rooms/${activeRoom}/messages`),{sender:uid,text,createdAt:Date.now()});}catch(err){alert("Message could not be sent. Check your connection.");}
});
$("invite-btn").addEventListener("click",async()=>{
  const url=location.href;try{await navigator.clipboard.writeText(url);$("invite-btn").textContent="Copied ✓";setTimeout(()=>$("invite-btn").textContent="↗ Invite",1800);}catch{prompt("Copy this private invite link:",url);}
});
async function startCall(video){
  try{
    if(pc)await endCall(false);
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video});
    pc=new RTCPeerConnection(rtcConfig);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    pc.ontrack=e=>{const stream=e.streams[0];if(video){$("remote-video").srcObject=stream;$("remote-video").classList.remove("hidden");}else{$("remote-audio").srcObject=stream;}};
    $("local-video").srcObject=video?localStream:null;$("local-video").classList.toggle("hidden",!video);
    callId=push(ref(db,`rooms/${activeRoom}/calls`)).key;isCaller=true;
    const callRef=ref(db,`rooms/${activeRoom}/calls/${callId}`);
    const callerCandidates=ref(db,`rooms/${activeRoom}/calls/${callId}/callerCandidates`);
    pc.onicecandidate=e=>{if(e.candidate)push(callerCandidates,e.candidate.toJSON());};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await set(callRef,{from:uid,kind:video?"video":"audio",offer:{type:offer.type,sdp:offer.sdp},createdAt:Date.now(),status:"ringing"});
    callUnsubs.push(onValue(ref(db,`rooms/${activeRoom}/calls/${callId}/answer`),snap=>{if(snap.exists()&&pc&&pc.signalingState!=="closed")pc.setRemoteDescription(new RTCSessionDescription(snap.val()));}));
    callUnsubs.push(onValue(ref(db,`rooms/${activeRoom}/calls/${callId}/calleeCandidates`),snap=>snap.forEach(c=>pc&&pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(console.warn))));
    $("call-status").textContent="Calling… waiting for your person";$("hangup").classList.remove("hidden");
  }catch(err){console.error(err);$("call-status").textContent="Call couldn't start. Check permissions and use HTTPS.";await endCall(false);}
}
function listenIncomingCalls(){
  onValue(ref(db,`rooms/${activeRoom}/calls`),snap=>{
    const calls=snap.val()||{};
    for(const [id,c] of Object.entries(calls)){
      if(c.from!==uid&&c.status==="ringing"&&c.offer&&!c.accepted){
        if(confirm(`Incoming ${c.kind} call 💗\nAnswer?`))answerCall(id,c);
        else set(ref(db,`rooms/${activeRoom}/calls/${id}/status`),"declined");
      }
    }
  });
}
async function answerCall(id,call){
  try{
    callId=id;isCaller=false;const video=call.kind==="video";
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video});
    pc=new RTCPeerConnection(rtcConfig);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    pc.ontrack=e=>{if(video){$("remote-video").srcObject=e.streams[0];$("remote-video").classList.remove("hidden");}else $("remote-audio").srcObject=e.streams[0];};
    $("local-video").srcObject=video?localStream:null;$("local-video").classList.toggle("hidden",!video);
    const callPath=`rooms/${activeRoom}/calls/${id}`;
    pc.onicecandidate=e=>{if(e.candidate)push(ref(db,`${callPath}/calleeCandidates`),e.candidate.toJSON());};
    await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await set(ref(db,`${callPath}/answer`),{type:answer.type,sdp:answer.sdp});
    callUnsubs.push(onValue(ref(db,`${callPath}/callerCandidates`),snap=>snap.forEach(c=>pc&&pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(console.warn))));
    set(ref(db,`${callPath}/accepted`),true);$("call-status").textContent="Connected 💗";$("hangup").classList.remove("hidden");
  }catch(err){console.error(err);$("call-status").textContent="Couldn't answer. Check microphone/camera permissions.";}
}
async function endCall(update=true){
  if(callUnsubs.length){callUnsubs.forEach(fn=>fn());callUnsubs=[];}
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  if(pc){pc.close();pc=null;}
  if(update&&callId&&isCaller)await set(ref(db,`rooms/${activeRoom}/calls/${callId}/status`),"ended");
  $("local-video").srcObject=null;$("remote-video").srcObject=null;$("remote-audio").srcObject=null;
  $("hangup").classList.add("hidden");$("call-status").textContent="No active call";callId=null;
}
$("audio-call").addEventListener("click",()=>startCall(false));
$("video-call").addEventListener("click",()=>startCall(true));
$("hangup").addEventListener("click",()=>endCall());
