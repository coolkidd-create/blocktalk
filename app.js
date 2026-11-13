const $ = id => document.getElementById(id);
let socket, myId, localStream, peers = new Map(), playerData = new Map(), joined = false;
let radius = 20;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function setStatus(text, online=false) {
  $("status").textContent = text;
  $("status").classList.toggle("online", online);
}
function positionFrom(prefix) {
  return { x: Number($(prefix+"x").value)||0, y: Number($(prefix+"y").value)||0, z: Number($(prefix+"z").value)||0 };
}
function distance(a,b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}
function send(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function updatePlayers() {
  const list = $("players");
  list.innerHTML = "";
  let nearby = 0;
  for (const [id,p] of playerData) {
    const d = distance(positionFrom("live"), p.position || {x:0,y:0,z:0});
    const isNear = d <= radius;
    if (isNear) nearby++;
    const li = document.createElement("li");
    const name = document.createElement("span"); name.textContent = p.name || "Player";
    const state = document.createElement("span");
    state.className = isNear ? "near" : "far";
    state.textContent = isNear ? `Nearby · ${d.toFixed(1)} blocks` : `Out of range · ${d.toFixed(1)} blocks`;
    li.append(name,state); list.append(li);
    const pc = peers.get(id);
    if (pc) {
      const audio = pc.audioElement;
      if (audio) audio.muted = !isNear;
    }
  }
  if (!playerData.size) {
    const li=document.createElement("li"); li.className="empty"; li.textContent="No one else is here yet."; list.append(li);
  }
  $("playerCount").textContent = `${playerData.size} player${playerData.size===1?"":"s"} · ${nearby} nearby`;
}
async function createPeer(id, initiate) {
  if (peers.has(id)) return peers.get(id);
  const pc = new RTCPeerConnection(config);
  const entry = { pc, audioElement: null };
  peers.set(id, entry);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.onicecandidate = e => { if(e.candidate) send({type:"ice",to:id,candidate:e.candidate}); };
  pc.ontrack = e => {
    let audio = entry.audioElement;
    if (!audio) {
      audio = document.createElement("audio"); audio.autoplay = true; audio.playsInline = true;
      document.body.appendChild(audio); entry.audioElement = audio;
    }
    audio.srcObject = e.streams[0];
    const player = playerData.get(id);
    audio.muted = !player || distance(positionFrom("live"), player.position) > radius;
    audio.play().catch(()=>{});
  };
  pc.onconnectionstatechange = () => {
    if (["failed","closed"].includes(pc.connectionState)) removePeer(id);
  };
  if (initiate) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({type:"offer",to:id,sdp:pc.localDescription});
  }
  return entry;
}
function removePeer(id) {
  const entry=peers.get(id);
  if(entry){ entry.pc.close(); entry.audioElement?.remove(); peers.delete(id); }
  playerData.delete(id); updatePlayers();
}
async function handleSignal(msg) {
  if(msg.type==="peer-joined") {
    playerData.set(msg.player.id,msg.player); updatePlayers();
    await createPeer(msg.player.id,true);
  } else if(msg.type==="peer-left") removePeer(msg.id);
  else if(msg.type==="position") {
    const p=playerData.get(msg.id);
    if(p){p.position=msg.position;updatePlayers();}
  } else if(msg.type==="offer") {
    const entry=await createPeer(msg.from,false);
    await entry.pc.setRemoteDescription(msg.sdp);
    const answer=await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    send({type:"answer",to:msg.from,sdp:entry.pc.localDescription});
  } else if(msg.type==="answer") {
    const entry=peers.get(msg.from);
    if(entry) await entry.pc.setRemoteDescription(msg.sdp);
  } else if(msg.type==="ice") {
    const entry=peers.get(msg.from);
    if(entry && msg.candidate) try { await entry.pc.addIceCandidate(msg.candidate); } catch(e) { console.warn(e); }
  } else if(msg.type==="error") $("error").textContent=msg.message;
}
async function join() {
  $("error").textContent="";
  if(!window.isSecureContext && location.hostname!=="localhost") {
    $("error").textContent="Microphone access needs a secure HTTPS website. Deploy this app with HTTPS first."; return;
  }
  if(!navigator.mediaDevices?.getUserMedia) {
    $("error").textContent="Microphone access is not available in this browser."; return;
  }
  try {
    localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    localStream.getAudioTracks().forEach(t=>t.enabled=false);
    const scheme=location.protocol==="https:"?"wss":"ws";
    socket=new WebSocket(`${scheme}://${location.host}`);
    socket.onopen=()=>{
      send({type:"join",name:$("name").value.trim()||"Player",room:$("room").value.trim(),position:positionFrom("")});
    };
    socket.onmessage=async e=>{
      const msg=JSON.parse(e.data);
      if(msg.type==="joined"){
        myId=msg.id; joined=true;
        msg.players.forEach(p=>playerData.set(p.id,p));
        $("setup").classList.add("hidden"); $("roomPanel").classList.remove("hidden");
        $("roomName").textContent=$("room").value.trim();
        $("liveX").value=$("x").value; $("liveY").value=$("y").value; $("liveZ").value=$("z").value;
        $("talk").disabled=false; setStatus("Connected",true); updatePlayers();
        for(const p of msg.players) await createPeer(p.id,false);
      } else await handleSignal(msg);
    };
    socket.onerror=()=>{$("error").textContent="Could not connect. Check that the voice server is running.";};
    socket.onclose=()=>{if(joined) leave(false);};
  } catch(e) {
    $("error").textContent=e.name==="NotAllowedError"?"Microphone permission was blocked. Allow microphone access for this website in Chrome.":`Could not start microphone: ${e.message}`;
  }
}
function setTalking(on) {
  if(!joined || !localStream) return;
  localStream.getAudioTracks().forEach(t=>t.enabled=on);
  $("talk").classList.toggle("active",on);
  $("talk").textContent=on?"Speaking… release to mute":"Hold to talk";
  $("micState").textContent=on?"Microphone is live":"Microphone is muted";
}
function leave(closeSocket=true) {
  setTalking(false); joined=false;
  for(const id of [...peers.keys()]) removePeer(id);
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  if(closeSocket && socket){socket.close();socket=null;}
  $("roomPanel").classList.add("hidden"); $("setup").classList.remove("hidden");
  $("talk").disabled=true; setStatus("Not connected"); playerData.clear(); updatePlayers();
}
$("join").addEventListener("click",join);
$("leave").addEventListener("click",()=>leave());
$("radius").addEventListener("input",e=>{radius=Number(e.target.value);$("radiusValue").textContent=radius;updatePlayers();});
$("updatePosition").addEventListener("click",()=>{
  $("liveX").value=$("liveX").value||0; $("liveY").value=$("liveY").value||0; $("liveZ").value=$("liveZ").value||0;
  send({type:"position",position:positionFrom("live")}); updatePlayers();
});
const talk=$("talk");
talk.addEventListener("pointerdown",e=>{e.preventDefault();talk.setPointerCapture(e.pointerId);setTalking(true);});
["pointerup","pointercancel","lostpointercapture"].forEach(ev=>talk.addEventListener(ev,()=>setTalking(false)));
document.addEventListener("keydown",e=>{if(e.code==="Space" && joined && document.activeElement.tagName!=="INPUT"){e.preventDefault();setTalking(true);}});
document.addEventListener("keyup",e=>{if(e.code==="Space")setTalking(false);});
window.addEventListener("beforeunload",()=>leave());
